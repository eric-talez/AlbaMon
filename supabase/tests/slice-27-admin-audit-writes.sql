-- ============================================================================
-- Slice 27 — live verification for transactional admin audit logs
-- ============================================================================
-- Proves, against a REAL Postgres (grants + RLS + triggers actually enforced),
-- that after 20260714000000_transactional_admin_audit_logs.sql:
--   A. admin approves a pending job -> job approved, posted_at stamped by
--      Postgres, exactly one job.approved audit row with the admin actor;
--   B. repeated/stale job moderation -> 'conflict', no additional audit row;
--   C. admin rejects a pending job -> posted_at untouched, one job.rejected row;
--   D. company verify + repeat -> one company.verified row, then conflict;
--   E. company no-op (already in requested state) -> conflict, zero rows;
--   F. company unverify -> one company.unverified row;
--   G. report review + repeat -> one report.reviewed row, then conflict;
--   H. report dismiss -> one report.dismissed row;
--   I. employer-access approve -> request approved, seeker promoted, one
--      employer_access.approved row with role_promoted=true; repeat conflicts;
--   J. employer-access reject -> no promotion, role_promoted=false; approving
--      a request whose requester is already an employer records
--      role_promoted=false;
--   K. a forced audit-insert failure rolls back the job mutation (atomicity);
--   L. anon cannot execute any review function (42501);
--   M. seeker and employer callers are rejected (P0001) and write nothing;
--   N. direct audit_logs DML is denied for authenticated sessions (grants);
--      the append-only trigger backstops the ordinary API roles even under
--      simulated grant/RLS drift; trusted maintenance (owner and service_role)
--      may update/delete; seekers read zero audit rows while admins read them;
--   O. service_role may DELETE an audit row (trusted maintenance) — the
--      append-only trigger does not raise;
--   P. deleting a profile referenced by an audit row runs the actor_id
--      ON DELETE SET NULL cascade under service_role: the audit row survives
--      and its actor_id becomes NULL, with no append-only-trigger exception.
--
-- Run ONLY against a disposable LOCAL stack (never hosted):
--   supabase start && supabase db reset            # applies migrations + seed
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/slice-27-admin-audit-writes.sql
--
-- Self-verifying: each check RAISEs on failure (psql exits non-zero) and emits
-- `PASS <case>` on success. Roles are simulated via SET LOCAL ROLE + the
-- request.jwt.claims GUC that Supabase's auth.uid()/auth.role() read; every
-- check runs in its own transaction and is rolled back, so this script mutates
-- nothing except the throwaway principals and queue fixtures it provisions up
-- front. Depends on supabase/seed.sql (pending job bbbbbbbb-..-0101, draft job
-- bbbbbbbb-..-0102, verified company aaaaaaaa-..-0001, unverified company
-- aaaaaaaa-..-0003, employer 11111111-..).

-- --- Provision throwaway admin + seeker principals ---------------------------
-- (Fresh UUIDs; slice-25's test owns 4444../5555.. with different roles.)
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'slice27-admin@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'slice27-seeker@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- Promote one to admin as the table owner (auth.uid() is null here, so the
-- role-lock trigger allows it).
update public.profiles set role = 'admin'
  where id = '66666666-6666-6666-6666-666666666666';

-- --- Provision queue fixtures the seed does not include ----------------------
insert into public.reports (id, reporter_id, job_id, company_id, reason, status)
values ('cccccccc-0000-0000-0000-000000000001',
        '77777777-7777-7777-7777-777777777777',
        'bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'spam', 'open')
on conflict (id) do nothing;

insert into public.employer_access_requests
  (id, requester_id, business_name, contact_name, city, state, status)
values
  ('dddddddd-0000-0000-0000-000000000001',
   '77777777-7777-7777-7777-777777777777',
   'Slice27 Test Bakery', 'Test Seeker', 'Irvine', 'CA', 'pending'),
  ('dddddddd-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'Slice27 Existing Employer Co', 'Seed Employer 1', 'Los Angeles', 'CA', 'pending')
on conflict (id) do nothing;

-- --- A. admin approves a pending job: atomic mutation + one audit row --------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int; entry record;
begin
  v := public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
  if v <> 'approved' then
    raise exception 'FAIL A: expected approved, got %', v;
  end if;
  if (select moderation_status from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') <> 'approved' then
    raise exception 'FAIL A: job not approved';
  end if;
  if (select posted_at from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') is distinct from now() then
    raise exception 'FAIL A: posted_at was not stamped by the function';
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 1 then
    raise exception 'FAIL A: expected exactly 1 audit row, found %', n;
  end if;
  select * into entry from public.audit_logs limit 1;
  if entry.action <> 'job.approved'
     or entry.entity_type <> 'job'
     or entry.entity_id <> 'bbbbbbbb-0000-0000-0000-000000000101'
     or entry.actor_id <> '66666666-6666-6666-6666-666666666666'
     or entry.metadata ->> 'from_status' <> 'pending'
     or entry.metadata ->> 'to_status' <> 'approved' then
    raise exception 'FAIL A: audit row mismatch: % % % %',
      entry.action, entry.entity_type, entry.actor_id, entry.metadata;
  end if;
  raise notice 'PASS A: approve mutated the job and wrote one job.approved row';
end $$;
rollback;

-- --- B. repeated/stale job moderation conflicts and writes nothing -----------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
  v := public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
  if v <> 'conflict' then
    raise exception 'FAIL B: repeat approve returned % (expected conflict)', v;
  end if;
  v := public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000102', 'approved');
  if v <> 'conflict' then
    raise exception 'FAIL B: draft-job approve returned % (expected conflict)', v;
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 1 then
    raise exception 'FAIL B: conflicts added audit rows (found %)', n;
  end if;
  if (select moderation_status from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000102') <> 'draft' then
    raise exception 'FAIL B: draft job was mutated';
  end if;
  raise notice 'PASS B: stale/repeated moderation conflicts write no audit rows';
end $$;
rollback;

-- --- C. admin rejects a pending job: posted_at untouched ----------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; before_posted timestamptz; n int;
begin
  select posted_at into before_posted from public.jobs
    where id = 'bbbbbbbb-0000-0000-0000-000000000101';
  v := public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'rejected');
  if v <> 'rejected' then
    raise exception 'FAIL C: expected rejected, got %', v;
  end if;
  if (select moderation_status from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') <> 'rejected' then
    raise exception 'FAIL C: job not rejected';
  end if;
  if (select posted_at from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') is distinct from before_posted then
    raise exception 'FAIL C: rejection changed posted_at';
  end if;
  select count(*) into n from public.audit_logs where action = 'job.rejected';
  if n <> 1 then
    raise exception 'FAIL C: expected one job.rejected row, found %', n;
  end if;
  raise notice 'PASS C: reject wrote one job.rejected row and kept posted_at';
end $$;
rollback;

-- --- D. company verify + repeat: one row, then conflict ----------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int; entry record;
begin
  v := public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003', true);
  if v <> 'verified' then
    raise exception 'FAIL D: expected verified, got %', v;
  end if;
  if (select is_verified from public.companies
      where id = 'aaaaaaaa-0000-0000-0000-000000000003') is not true then
    raise exception 'FAIL D: company not verified';
  end if;
  v := public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003', true);
  if v <> 'conflict' then
    raise exception 'FAIL D: repeat verify returned % (expected conflict)', v;
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 1 then
    raise exception 'FAIL D: expected exactly 1 audit row, found %', n;
  end if;
  select * into entry from public.audit_logs limit 1;
  if entry.action <> 'company.verified'
     or entry.entity_type <> 'company'
     or (entry.metadata ->> 'from_verified')::boolean is not false
     or (entry.metadata ->> 'to_verified')::boolean is not true then
    raise exception 'FAIL D: audit row mismatch: % %', entry.action, entry.metadata;
  end if;
  raise notice 'PASS D: verify wrote one company.verified row; repeat conflicted';
end $$;
rollback;

-- --- E. company no-op request: conflict, zero audit rows ----------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000001', true);
  if v <> 'conflict' then
    raise exception 'FAIL E: no-op verify returned % (expected conflict)', v;
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then
    raise exception 'FAIL E: no-op wrote % audit rows', n;
  end if;
  raise notice 'PASS E: already-verified company conflicts with no audit row';
end $$;
rollback;

-- --- F. company unverify: one company.unverified row --------------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000001', false);
  if v <> 'unverified' then
    raise exception 'FAIL F: expected unverified, got %', v;
  end if;
  select count(*) into n from public.audit_logs
    where action = 'company.unverified'
      and entity_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FAIL F: expected one company.unverified row, found %', n;
  end if;
  raise notice 'PASS F: unverify wrote one company.unverified row';
end $$;
rollback;

-- --- G. report review + repeat: one row, then conflict ------------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
  if v <> 'reviewed' then
    raise exception 'FAIL G: expected reviewed, got %', v;
  end if;
  if (select status from public.reports
      where id = 'cccccccc-0000-0000-0000-000000000001') <> 'reviewed' then
    raise exception 'FAIL G: report not reviewed';
  end if;
  v := public.review_report('cccccccc-0000-0000-0000-000000000001', 'dismissed');
  if v <> 'conflict' then
    raise exception 'FAIL G: repeat review returned % (expected conflict)', v;
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 1 then
    raise exception 'FAIL G: expected exactly 1 audit row, found %', n;
  end if;
  if (select action from public.audit_logs limit 1) <> 'report.reviewed' then
    raise exception 'FAIL G: wrong audit action';
  end if;
  raise notice 'PASS G: review wrote one report.reviewed row; repeat conflicted';
end $$;
rollback;

-- --- H. report dismiss: one report.dismissed row -------------------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.review_report('cccccccc-0000-0000-0000-000000000001', 'dismissed');
  if v <> 'dismissed' then
    raise exception 'FAIL H: expected dismissed, got %', v;
  end if;
  select count(*) into n from public.audit_logs where action = 'report.dismissed';
  if n <> 1 then
    raise exception 'FAIL H: expected one report.dismissed row, found %', n;
  end if;
  raise notice 'PASS H: dismiss wrote one report.dismissed row';
end $$;
rollback;

-- --- I. employer-access approve: promotion + one audit row + repeat conflict --
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int; entry record;
begin
  v := public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'approved');
  if v <> 'approved' then
    raise exception 'FAIL I: expected approved, got %', v;
  end if;
  if (select status from public.employer_access_requests
      where id = 'dddddddd-0000-0000-0000-000000000001') <> 'approved' then
    raise exception 'FAIL I: request not approved';
  end if;
  if (select role from public.profiles
      where id = '77777777-7777-7777-7777-777777777777') <> 'employer' then
    raise exception 'FAIL I: requester was not promoted to employer';
  end if;
  v := public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'approved');
  if v <> 'conflict' then
    raise exception 'FAIL I: repeat review returned % (expected conflict)', v;
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 1 then
    raise exception 'FAIL I: expected exactly 1 audit row, found %', n;
  end if;
  select * into entry from public.audit_logs limit 1;
  if entry.action <> 'employer_access.approved'
     or entry.entity_type <> 'employer_access_request'
     or entry.entity_id <> 'dddddddd-0000-0000-0000-000000000001'
     or entry.metadata ->> 'requester_id' <> '77777777-7777-7777-7777-777777777777'
     or (entry.metadata ->> 'role_promoted')::boolean is not true then
    raise exception 'FAIL I: audit row mismatch: % %', entry.action, entry.metadata;
  end if;
  raise notice 'PASS I: approval promoted the seeker and wrote one audit row';
end $$;
rollback;

-- --- J. employer-access reject + approve-without-promotion --------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'rejected');
  if v <> 'rejected' then
    raise exception 'FAIL J: expected rejected, got %', v;
  end if;
  if (select role from public.profiles
      where id = '77777777-7777-7777-7777-777777777777') <> 'seeker' then
    raise exception 'FAIL J: rejection changed the requester role';
  end if;
  if (select metadata ->> 'role_promoted' from public.audit_logs
      where action = 'employer_access.rejected') <> 'false' then
    raise exception 'FAIL J: rejection did not record role_promoted=false';
  end if;
  -- Approving a request whose requester is already an employer must not
  -- promote anyone and must record role_promoted=false.
  v := public.review_employer_access_request('dddddddd-0000-0000-0000-000000000002', 'approved');
  if v <> 'approved' then
    raise exception 'FAIL J: expected approved for existing employer, got %', v;
  end if;
  if (select role from public.profiles
      where id = '11111111-1111-1111-1111-111111111111') <> 'employer' then
    raise exception 'FAIL J: existing employer role changed unexpectedly';
  end if;
  if (select metadata ->> 'role_promoted' from public.audit_logs
      where action = 'employer_access.approved') <> 'false' then
    raise exception 'FAIL J: no-promotion approval did not record role_promoted=false';
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 2 then
    raise exception 'FAIL J: expected 2 audit rows, found %', n;
  end if;
  raise notice 'PASS J: reject and no-promotion approve recorded role_promoted=false';
end $$;
rollback;

-- --- K. atomicity: a failing audit insert rolls back the entity mutation ------
begin;
-- Owner installs a temporary trigger that makes the audit insert fail.
create function public.slice27_fail_audit() returns trigger
language plpgsql as $t$
begin
  raise exception 'slice27 forced audit failure';
end;
$t$;
create trigger slice27_block_audit
  before insert on public.audit_logs
  for each row execute function public.slice27_fail_audit();
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL K: expected the forced audit failure to abort the call';
  exception when others then
    if sqlerrm not like '%slice27 forced audit failure%' then
      raise;
    end if;
  end;
  if (select moderation_status from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') <> 'pending' then
    raise exception 'FAIL K: job mutation survived the audit failure';
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then
    raise exception 'FAIL K: audit row survived its own failure (%)', n;
  end if;
  raise notice 'PASS K: audit failure rolled back the job mutation atomically';
end $$;
rollback;  -- also removes the temporary trigger + function

-- --- L. anon cannot execute any review function --------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL L: anon executed moderate_pending_job';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003', true);
    raise exception 'FAIL L: anon executed set_company_verification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
    raise exception 'FAIL L: anon executed review_report';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL L: anon executed review_employer_access_request';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS L: anon is denied execute on all four functions (42501)';
end $$;
rollback;

-- --- M. seeker and employer callers are rejected with P0001 --------------------
begin;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL M: seeker moderated a job';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
  begin
    perform public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003', true);
    raise exception 'FAIL M: seeker verified a company';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
  begin
    perform public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
    raise exception 'FAIL M: seeker reviewed a report';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
  begin
    perform public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL M: seeker reviewed an employer access request';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL M: employer moderated a job';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
  begin
    perform public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
    raise exception 'FAIL M: employer reviewed a report';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if;
  end;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.audit_logs;
  if n <> 0 then
    raise exception 'FAIL M: rejected callers wrote % audit rows', n;
  end if;
  if (select moderation_status from public.jobs
      where id = 'bbbbbbbb-0000-0000-0000-000000000101') <> 'pending' then
    raise exception 'FAIL M: rejected callers mutated the pending job';
  end if;
  raise notice 'PASS M: seeker/employer callers hit the admin gate and wrote nothing';
end $$;
rollback;

-- --- N. audit_logs is append-only across grants and the guard trigger ----------
begin;
-- Seed one row as the owner inside this rolled-back transaction.
insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
values ('66666666-6666-6666-6666-666666666666', 'job.approved', 'job',
        'bbbbbbbb-0000-0000-0000-000000000101', '{}');
-- (a) authenticated sessions lack INSERT/UPDATE/DELETE grants entirely.
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    insert into public.audit_logs (action, entity_type) values ('x', 'y');
    raise exception 'FAIL N: authenticated inserted an audit row directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.audit_logs set action = 'tampered';
    raise exception 'FAIL N: authenticated updated an audit row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_logs;
    raise exception 'FAIL N: authenticated deleted audit rows';
  exception when insufficient_privilege then null;
  end;
  -- Admin JWT: RLS SELECT works.
  if (select count(*) from public.audit_logs) <> 1 then
    raise exception 'FAIL N: admin could not read the audit row';
  end if;
  raise notice 'PASS N1: authenticated has no direct DML; admin reads rows';
end $$;
-- (b) seeker JWT: SELECT grant passes but RLS filters everything.
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.audit_logs) <> 0 then
    raise exception 'FAIL N: seeker read audit rows through RLS';
  end if;
  raise notice 'PASS N2: seeker reads zero audit rows';
end $$;
reset role;
-- (c) Defense-in-depth: even if the audit_logs grants/RLS ever drifted open,
-- the trigger still blocks the ordinary API roles. Simulate the drift inside
-- this rolled-back transaction only (never against real state).
grant update, delete on table public.audit_logs to authenticated;
alter table public.audit_logs disable row level security;
set local role authenticated;
do $$
begin
  begin
    update public.audit_logs set action = 'tampered';
    raise exception 'FAIL N: trigger did not block authenticated update after simulated drift';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_logs;
    raise exception 'FAIL N: trigger did not block authenticated delete after simulated drift';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS N3: append-only trigger backstops ordinary API roles under drift';
end $$;
reset role;
-- (d) service_role is trusted maintenance and may repair audit rows.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
begin
  update public.audit_logs set actor_id = null;
  if (select count(*) from public.audit_logs where actor_id is null) <> 1 then
    raise exception 'FAIL N: service_role repair update did not apply';
  end if;
  raise notice 'PASS N4: service_role maintenance can update audit rows';
end $$;
reset role;
-- (e) Owner maintenance can update/delete regardless of any JWT claims left
-- in the session — the guard keys on role identity, not claim presence.
do $$
begin
  update public.audit_logs set action = 'job.approved';
  delete from public.audit_logs;
  raise notice 'PASS N5: owner maintenance can update/delete';
end $$;
rollback;

-- --- O. service_role DELETE of an audit row (trusted maintenance) -------------
begin;
-- Independent throwaway audit row (distinct from case P's FK-cascade row).
insert into public.audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
values ('eeeeeeee-0000-0000-0000-000000000001',
        '66666666-6666-6666-6666-666666666666', 'job.approved', 'job',
        'bbbbbbbb-0000-0000-0000-000000000101', '{}');
set local role service_role;
do $$
begin
  begin
    delete from public.audit_logs
      where id = 'eeeeeeee-0000-0000-0000-000000000001';
  exception when others then
    raise exception 'FAIL O: append-only trigger blocked a service_role delete (%)', sqlerrm;
  end;
  if exists (select 1 from public.audit_logs
             where id = 'eeeeeeee-0000-0000-0000-000000000001') then
    raise exception 'FAIL O: service_role delete did not remove the audit row';
  end if;
  raise notice 'PASS O: service_role can delete audit rows (trusted maintenance)';
end $$;
reset role;
rollback;

-- --- P. profile deletion nulls actor_id via ON DELETE SET NULL ----------------
begin;
-- Fresh throwaway principal (fresh UUID, no collision with 1111/4444/5555/
-- 6666/7777 fixtures). on_auth_user_created provisions the matching profile.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '88888888-8888-8888-8888-888888888888',
   'authenticated', 'authenticated', 'slice27-fk-actor@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
values ('eeeeeeee-0000-0000-0000-000000000002',
        '88888888-8888-8888-8888-888888888888', 'job.approved', 'job',
        'bbbbbbbb-0000-0000-0000-000000000101', '{}');
do $$
begin
  if (select actor_id from public.audit_logs
      where id = 'eeeeeeee-0000-0000-0000-000000000002')
     is distinct from '88888888-8888-8888-8888-888888888888' then
    raise exception 'FAIL P: audit row did not capture the actor UUID';
  end if;
end $$;
set local role service_role;
do $$
begin
  begin
    delete from public.profiles
      where id = '88888888-8888-8888-8888-888888888888';
  exception when others then
    raise exception 'FAIL P: profile delete failed or the append-only trigger raised (%)', sqlerrm;
  end;
  if not exists (select 1 from public.audit_logs
                 where id = 'eeeeeeee-0000-0000-0000-000000000002') then
    raise exception 'FAIL P: the audit row was removed by the profile delete';
  end if;
  if (select actor_id from public.audit_logs
      where id = 'eeeeeeee-0000-0000-0000-000000000002') is not null then
    raise exception 'FAIL P: actor_id was not set to NULL by the FK cascade';
  end if;
  raise notice 'PASS P: profile delete preserved the audit row and nulled actor_id';
end $$;
reset role;
rollback;

\echo 'Slice 27 live verification: all cases passed.'
