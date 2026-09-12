-- Integrate July moderation RPCs with the September launch lifecycle.
-- Do not rewrite either historical migration chain. The September AFTER
-- triggers remain the sole decision audit writers for both RPC and direct /
-- trusted mutations. Trigger errors roll back the enclosing RPC transaction.
-- Canonical metadata remains previous/current; employer role promotion is
-- verified by the transactional profile write, not a second audit event.

-- The old signature cannot carry an honest caller revision or rejection reason.
-- Keep a non-callable tombstone so stale clients cannot bypass transition_job.
create or replace function public.moderate_pending_job(job_id uuid, decision text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Use transition_job with a revision and review reason'
    using errcode = '42501';
end;
$$;
revoke all on function public.moderate_pending_job(uuid, text)
  from public, anon, authenticated, service_role;
comment on function public.moderate_pending_job(uuid, text) is
  'Retired: use transition_job(uuid,text,timestamptz,text) for reviewed publication with a caller revision and required rejection reason.';

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

  -- The AFTER UPDATE trigger writes the one canonical audit in this transaction.

  return outcome;
end;
$$;

revoke all on function public.set_company_verification(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_company_verification(uuid, boolean) to authenticated;
comment on function public.set_company_verification(uuid, boolean) is
  'Admin-only locked decision; September triggers record exactly one canonical audit in the same transaction. Conflicts write nothing.';

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

  -- The AFTER UPDATE trigger writes the one canonical audit in this transaction.

  return decision;
end;
$$;

revoke all on function public.review_report(uuid, text) from public, anon, authenticated;
grant execute on function public.review_report(uuid, text) to authenticated;
comment on function public.review_report(uuid, text) is
  'Admin-only locked decision; September triggers record exactly one canonical audit in the same transaction. Conflicts write nothing.';

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
  end if;

  -- The AFTER UPDATE trigger writes the one canonical audit in this transaction.

  return decision;
end;
$$;

revoke all on function public.review_employer_access_request(uuid, text) from public, anon, authenticated;
grant execute on function public.review_employer_access_request(uuid, text) to authenticated;
comment on function public.review_employer_access_request(uuid, text) is
  'Admin-only locked decision; September triggers record exactly one canonical audit in the same transaction. Conflicts write nothing.';
