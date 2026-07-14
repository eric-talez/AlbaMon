-- Slice 27: transactional admin audit logs.
--
-- Every admin moderation decision (job approve/reject, company verify/unverify,
-- report review/dismiss, employer access approve/reject) now runs inside ONE
-- SECURITY DEFINER function that performs the entity mutation AND inserts the
-- matching public.audit_logs row, so the decision and its audit trail commit or
-- roll back together. The actor is always auth.uid() captured inside Postgres —
-- callers cannot supply an actor id, an action name, or metadata.
--
-- Authorization model (unchanged surface, new write path):
--   * every function requires a non-null auth.uid() AND public.is_admin(),
--     raising an exception (P0001) otherwise — the app's requireRole('admin')
--     server-action guard stays as the first layer, this is the final layer;
--   * execution is revoked from public/anon and granted only to authenticated;
--   * audit_logs keeps its admin-only SELECT policy and gains NO insert/update/
--     delete policy and NO new table grants: the definer (table owner) writes
--     directly, exactly like review_employer_access_request already writes
--     public.profiles.
--
-- Conflict model: the target row is locked with SELECT ... FOR UPDATE; a
-- missing row or one not in the expected prior state returns 'conflict' before
-- any mutation, so stale/repeated reviews never write an audit row. A no-op
-- company verification request (already in the requested state) is a conflict
-- on purpose. Audit metadata is minimal and structured (statuses, booleans,
-- ids) — never emails, phone numbers, addresses, or free-text fields.
--
-- Append-only guard: a BEFORE UPDATE OR DELETE trigger rejects changes to
-- audit rows from the ordinary API roles (anon, authenticated — admins
-- included, since admins act through those roles). It is SECURITY INVOKER and
-- keys on role identity (current_user), so trusted maintenance is untouched:
-- the service_role key, owner migrations, SQL-editor sessions, restores, and
-- the actor_id ON DELETE SET NULL cascade (referential actions run as the
-- table owner) all pass. Ordinary roles already hold no UPDATE/DELETE grants
-- on audit_logs; the trigger is defense-in-depth should those grants or the
-- RLS surface ever drift.

-- ----------------------------------------------------------------------------
-- 1. Append-only guard for audit_logs
-- ----------------------------------------------------------------------------
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'audit_logs is append-only'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.prevent_audit_log_mutation() is
  'Defense-in-depth: blocks UPDATE/DELETE on audit_logs for the ordinary API roles (anon, authenticated); trusted maintenance (owner, service_role, referential actions) passes.';

drop trigger if exists audit_logs_prevent_mutation on public.audit_logs;
create trigger audit_logs_prevent_mutation
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_log_mutation();

-- ----------------------------------------------------------------------------
-- 2. Job moderation: approve/reject a pending job + audit row, atomically
-- ----------------------------------------------------------------------------
create or replace function public.moderate_pending_job(
  job_id uuid,
  decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.jobs%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an admin may moderate jobs';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Unsupported job moderation decision: %', decision;
  end if;

  select * into target
  from public.jobs
  where id = job_id
  for update;

  if not found or target.moderation_status <> 'pending' then
    return 'conflict';
  end if;

  -- Approval stamps the authoritative publication time in Postgres; rejection
  -- leaves posted_at untouched.
  if decision = 'approved' then
    update public.jobs
    set moderation_status = 'approved',
        posted_at = now()
    where id = job_id;
  else
    update public.jobs
    set moderation_status = 'rejected'
    where id = job_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case when decision = 'approved' then 'job.approved' else 'job.rejected' end,
    'job',
    target.id,
    jsonb_build_object(
      'decision', decision,
      'from_status', target.moderation_status,
      'to_status', decision
    )
  );

  return decision;
end;
$$;

comment on function public.moderate_pending_job(uuid, text) is
  'Admin-only: approve/reject a pending job (approval stamps posted_at via now()) and record the decision in audit_logs in the same transaction; stale/repeated reviews return conflict and write nothing.';

revoke all on function public.moderate_pending_job(uuid, text) from public, anon, authenticated;
grant execute on function public.moderate_pending_job(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Company verification: set/remove verification + audit row, atomically
-- ----------------------------------------------------------------------------
create or replace function public.set_company_verification(
  company_id uuid,
  verified boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.companies%rowtype;
  outcome text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an admin may change company verification';
  end if;

  if verified is null then
    raise exception 'Unsupported company verification decision';
  end if;

  select * into target
  from public.companies
  where id = company_id
  for update;

  -- A company already in the requested state is a conflict and writes NO
  -- audit row (replaces the previously idempotent direct update).
  if not found or target.is_verified = verified then
    return 'conflict';
  end if;

  update public.companies
  set is_verified = verified
  where id = company_id;

  outcome := case when verified then 'verified' else 'unverified' end;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case when verified then 'company.verified' else 'company.unverified' end,
    'company',
    target.id,
    jsonb_build_object(
      'from_verified', target.is_verified,
      'to_verified', verified
    )
  );

  return outcome;
end;
$$;

comment on function public.set_company_verification(uuid, boolean) is
  'Admin-only: verify/unverify a company and record the change in audit_logs in the same transaction; a request matching the current state returns conflict and writes nothing.';

revoke all on function public.set_company_verification(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_company_verification(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Report review: mark an open report reviewed/dismissed + audit row
-- ----------------------------------------------------------------------------
create or replace function public.review_report(
  report_id uuid,
  decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.reports%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an admin may review reports';
  end if;

  if decision not in ('reviewed', 'dismissed') then
    raise exception 'Unsupported report review decision: %', decision;
  end if;

  select * into target
  from public.reports
  where id = report_id
  for update;

  if not found or target.status <> 'open' then
    return 'conflict';
  end if;

  update public.reports
  set status = decision
  where id = report_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case when decision = 'reviewed' then 'report.reviewed' else 'report.dismissed' end,
    'report',
    target.id,
    jsonb_build_object(
      'from_status', target.status,
      'to_status', decision
    )
  );

  return decision;
end;
$$;

comment on function public.review_report(uuid, text) is
  'Admin-only: mark an open report reviewed/dismissed and record the decision in audit_logs in the same transaction; a report that is not open returns conflict and writes nothing.';

revoke all on function public.review_report(uuid, text) from public, anon, authenticated;
grant execute on function public.review_report(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Employer access review: redefined to add the audit write. Behavior is
--    otherwise identical to 20260706000000_employer_access_requests.sql
--    (admin guard, decision validation, pending-only conflict semantics,
--    reviewed_by/reviewed_at stamping, seeker->employer promotion).
-- ----------------------------------------------------------------------------
create or replace function public.review_employer_access_request(
  request_id uuid,
  decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.employer_access_requests%rowtype;
  v_promoted_count integer := 0;
  v_role_promoted boolean := false;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only an admin may review employer access requests';
  end if;

  if decision not in ('approved', 'rejected') then
    raise exception 'Unsupported employer access request decision: %', decision;
  end if;

  select * into target
  from public.employer_access_requests
  where id = request_id
  for update;

  if not found or target.status <> 'pending' then
    return 'conflict';
  end if;

  update public.employer_access_requests
  set status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_id;

  -- Approval promotes seeker -> employer only. It never touches an admin
  -- profile, and a rejection never changes any role.
  if decision = 'approved' then
    update public.profiles
    set role = 'employer'
    where id = target.requester_id
      and role = 'seeker';
    get diagnostics v_promoted_count = row_count;
    v_role_promoted := v_promoted_count = 1;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    case
      when decision = 'approved' then 'employer_access.approved'
      else 'employer_access.rejected'
    end,
    'employer_access_request',
    target.id,
    jsonb_build_object(
      'decision', decision,
      'requester_id', target.requester_id,
      'from_status', target.status,
      'to_status', decision,
      'role_promoted', v_role_promoted
    )
  );

  return decision;
end;
$$;

comment on function public.review_employer_access_request(uuid, text) is
  'Admin-only: approve/reject a pending employer access request, promote the requester from seeker to employer on approval, and record the decision in audit_logs — all in the same transaction.';

-- Function ACLs survive create-or-replace, but restate them so this migration
-- is self-contained about who may execute the reviewed definition.
revoke all on function public.review_employer_access_request(uuid, text) from public, anon, authenticated;
grant execute on function public.review_employer_access_request(uuid, text) to authenticated;
