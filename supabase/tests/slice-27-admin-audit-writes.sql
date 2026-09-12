-- Current integration contract for transactional moderation and audit guards.
-- Run via scripts/test-database.mjs, on a disposable local stack only.
-- The full script rolls back setup and assertions; each case has a savepoint.
-- July's two-argument job RPC is retired. Launch transition_job and September
-- triggers are canonical: one decision audit, including direct/trusted changes.
begin;
\ir database/helpers/policy-fixtures.inc

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

-- Set up current actor acknowledgements once, then isolate decision audit counts.
select set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}',true);
select pg_temp.acknowledge_test_actor();
select set_config('request.jwt.claims','{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}',true);
select pg_temp.acknowledge_test_actor();
select set_config('request.jwt.claims','{}',true);
-- All existing rows and fixture changes return on the final ROLLBACK.
delete from public.audit_logs;

-- This fixture adapter uses the reviewed launch RPC. Lifecycle/token/reason
-- admission is also asserted directly below and in job_lifecycle.test.sql.
create function pg_temp.review_test_job(target uuid, decision text) returns text
language plpgsql as $$
declare result text;
begin
  select status into result from public.transition_job(target,
    case when decision='approved' then 'approve' else 'reject' end,
    (select updated_at from public.jobs where id=target),
    case when decision='rejected' then 'Fixture rejection reason' else null end);
  return case when result='updated' then decision else 'conflict' end;
end; $$;

-- --- A. admin approves a pending job: atomic mutation + one audit row --------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare v text; n int; entry record;
begin
  v := pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
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
     or entry.metadata ->> 'previous' <> 'pending'
     or entry.metadata ->> 'current' <> 'approved' then
    raise exception 'FAIL A: audit row mismatch: % % % %',
      entry.action, entry.entity_type, entry.actor_id, entry.metadata;
  end if;
  raise notice 'PASS A: approve mutated the job and wrote one job.approved row';
end $$;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- B. repeated/stale job moderation conflicts and writes nothing -----------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  perform pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
  v := pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
  if v <> 'conflict' then
    raise exception 'FAIL B: repeat approve returned % (expected conflict)', v;
  end if;
  v := pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000102', 'approved');
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- C. admin rejects a pending job: posted_at untouched ----------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare v text; before_posted timestamptz; n int;
begin
  select posted_at into before_posted from public.jobs
    where id = 'bbbbbbbb-0000-0000-0000-000000000101';
  v := pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000101', 'rejected');
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- D. company verify + repeat: one row, then conflict ----------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
  if entry.action <> 'company.verification_changed'
     or entry.entity_type <> 'company'
     or (entry.metadata ->> 'previous')::boolean is not false
     or (entry.metadata ->> 'current')::boolean is not true then
    raise exception 'FAIL D: audit row mismatch: % %', entry.action, entry.metadata;
  end if;
  raise notice 'PASS D: verify wrote one canonical verification row; repeat conflicted';
end $$;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- E. company no-op request: conflict, zero audit rows ----------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- F. company unverify: one company.unverified row --------------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare v text; n int;
begin
  v := public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000001', false);
  if v <> 'unverified' then
    raise exception 'FAIL F: expected unverified, got %', v;
  end if;
  select count(*) into n from public.audit_logs
    where action = 'company.verification_changed'
      and entity_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FAIL F: expected one company.unverified row, found %', n;
  end if;
  raise notice 'PASS F: unverify wrote one canonical verification row';
end $$;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- G. report review + repeat: one row, then conflict ------------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- H. report dismiss: one report.dismissed row -------------------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- I. employer-access approve: promotion + one audit row + repeat conflict --
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
     or entry.metadata ->> 'previous' <> 'pending'
     or entry.metadata ->> 'current' <> 'approved' then
    raise exception 'FAIL I: audit row mismatch: % %', entry.action, entry.metadata;
  end if;
  raise notice 'PASS I: approval promoted the seeker and wrote one audit row';
end $$;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- J. employer-access reject + approve-without-promotion --------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
  -- Approving a request whose requester is already an employer must not
  -- promote anyone.
  v := public.review_employer_access_request('dddddddd-0000-0000-0000-000000000002', 'approved');
  if v <> 'approved' then
    raise exception 'FAIL J: expected approved for existing employer, got %', v;
  end if;
  if (select role from public.profiles
      where id = '11111111-1111-1111-1111-111111111111') <> 'employer' then
    raise exception 'FAIL J: existing employer role changed unexpectedly';
  end if;
  select count(*) into n from public.audit_logs;
  if n <> 2 then
    raise exception 'FAIL J: expected 2 audit rows, found %', n;
  end if;
  raise notice 'PASS J: rejection and existing-employer approval preserved roles and wrote one audit each';
end $$;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- K. atomicity: a failing audit insert rolls back the entity mutation ------
savepoint slice_case;
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
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    perform pg_temp.review_test_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
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
rollback to savepoint slice_case; release savepoint slice_case;  -- also removes the temporary trigger + function

-- --- L. anon cannot execute any review function --------------------------------
savepoint slice_case;
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- M. seeker and employer callers are rejected with P0001 --------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL M: seeker executed retired job RPC';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
  end;
  begin
    perform public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003', true);
    raise exception 'FAIL M: seeker verified a company';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
  end;
  begin
    perform public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
    raise exception 'FAIL M: seeker reviewed a report';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
  end;
  begin
    perform public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001', 'approved');
    raise exception 'FAIL M: seeker reviewed an employer access request';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.moderate_pending_job('bbbbbbbb-0000-0000-0000-000000000101', 'approved');
    raise exception 'FAIL M: employer executed retired job RPC';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
  end;
  begin
    perform public.review_report('cccccccc-0000-0000-0000-000000000001', 'reviewed');
    raise exception 'FAIL M: employer reviewed a report';
  exception when others then
    if sqlstate not in ('P0001','42501') or sqlerrm like 'FAIL %' then raise; end if;
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- N. audit_logs is append-only across grants and the guard trigger ----------
savepoint slice_case;
-- Seed one row as the owner inside this rolled-back transaction.
insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
values ('66666666-6666-6666-6666-666666666666', 'job.approved', 'job',
        'bbbbbbbb-0000-0000-0000-000000000101', '{}');
-- (a) authenticated sessions lack INSERT/UPDATE/DELETE grants entirely.
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}', true);
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- O. service_role DELETE of an audit row (trusted maintenance) -------------
savepoint slice_case;
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
rollback to savepoint slice_case; release savepoint slice_case;

-- --- P. profile deletion nulls actor_id via ON DELETE SET NULL ----------------
savepoint slice_case;
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
rollback to savepoint slice_case; release savepoint slice_case;



-- --- Q. retired job RPC and launch lifecycle requirements --------------------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$
declare revision timestamptz; result text;
begin
  if has_function_privilege('authenticated','public.moderate_pending_job(uuid,text)','EXECUTE') then
    raise exception 'FAIL Q: authenticated retains legacy job moderation';
  end if;
  select updated_at into revision from public.jobs where id='bbbbbbbb-0000-0000-0000-000000000101';
  select status into result from public.transition_job('bbbbbbbb-0000-0000-0000-000000000101','reject',revision,null);
  if result is distinct from 'not_allowed' then raise exception 'FAIL Q: rejection accepted without reason'; end if;
  select status into result from public.transition_job('bbbbbbbb-0000-0000-0000-000000000101','approve',revision-interval '1 second');
  if result is distinct from 'conflict' then raise exception 'FAIL Q: approval accepted stale revision'; end if;
  select status into result from public.transition_job('bbbbbbbb-0000-0000-0000-000000000101','approve',revision);
  if result is distinct from 'updated' or not exists(select 1 from public.jobs
    where id='bbbbbbbb-0000-0000-0000-000000000101' and expires_at=now()+interval '30 days' and posted_at=now()) then
    raise exception 'FAIL Q: reviewed publication did not establish expiry';
  end if;
  raise notice 'PASS Q: legacy RPC denied; revision, reason and expiry enforced';
end $$;
reset role;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- R. MFA is a live database requirement for every current admin RPC -------
savepoint slice_case;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$
declare statement text; denied boolean;
begin
  foreach statement in array array[
    $q$select public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003',true)$q$,
    $q$select public.review_report('cccccccc-0000-0000-0000-000000000001','reviewed')$q$,
    $q$select public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001','approved')$q$
  ] loop
    denied:=false;
    begin execute statement; exception when sqlstate 'P0001' then denied:=true; end;
    if not denied then raise exception 'FAIL R: AAL1 administrator wrote a decision'; end if;
  end loop;
  raise notice 'PASS R: all current admin RPCs require AAL2';
end $$;
reset role;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- S. audit failure rolls back each non-job decision and role promotion ----
savepoint slice_case;
create function public.slice27_fail_audit() returns trigger language plpgsql as $$
begin raise exception 'slice27 forced audit failure'; end; $$;
create trigger slice27_block_audit before insert on public.audit_logs
for each row execute function public.slice27_fail_audit();
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$
declare statement text; denied boolean;
begin
  foreach statement in array array[
    $q$select public.set_company_verification('aaaaaaaa-0000-0000-0000-000000000003',true)$q$,
    $q$select public.review_report('cccccccc-0000-0000-0000-000000000001','reviewed')$q$,
    $q$select public.review_employer_access_request('dddddddd-0000-0000-0000-000000000001','approved')$q$
  ] loop
    denied:=false;
    begin execute statement;
    exception when others then
      if sqlerrm <> 'slice27 forced audit failure' then raise; end if;
      denied:=true;
    end;
    if not denied then raise exception 'FAIL S: decision committed without an audit'; end if;
  end loop;
  if (select is_verified from public.companies where id='aaaaaaaa-0000-0000-0000-000000000003') is distinct from false
    or (select status from public.reports where id='cccccccc-0000-0000-0000-000000000001') is distinct from 'open'
    or (select status from public.employer_access_requests where id='dddddddd-0000-0000-0000-000000000001') is distinct from 'pending'
    or (select role::text from public.profiles where id='77777777-7777-7777-7777-777777777777') is distinct from 'seeker'
    or exists(select 1 from public.audit_logs) then
    raise exception 'FAIL S: failed decision left mutation or audit residue';
  end if;
  raise notice 'PASS S: audit failure rolls back company/report/access decisions and promotion';
end $$;
reset role;
rollback to savepoint slice_case; release savepoint slice_case;

-- --- T. suspension and missing current policy cannot hide behind definer RPCs -
savepoint slice_case;
select set_config('request.jwt.claims','{}',true);
update public.profiles set account_status='suspended' where id='66666666-6666-6666-6666-666666666666';
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$
declare denied boolean:=false;
begin
  begin perform public.review_report('cccccccc-0000-0000-0000-000000000001','reviewed');
  exception when sqlstate 'P0001' then denied:=true; end;
  if not denied then raise exception 'FAIL T: suspended admin reviewed a report'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set account_status='active',policy_identity=null where id='66666666-6666-6666-6666-666666666666';
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
do $$
declare denied boolean:=false;
begin
  begin perform public.review_report('cccccccc-0000-0000-0000-000000000001','reviewed');
  exception when insufficient_privilege then
    if sqlerrm <> 'policy_acknowledgement_required' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'FAIL T: unacknowledged admin reviewed a report'; end if;
  if (select status from public.reports where id='cccccccc-0000-0000-0000-000000000001') is distinct from 'open'
    or exists(select 1 from public.audit_logs) then raise exception 'FAIL T: rejected actor changed data'; end if;
  raise notice 'PASS T: suspension and current-policy guards survive definer RPCs';
end $$;
reset role;
rollback to savepoint slice_case; release savepoint slice_case;

rollback;
\echo 'Slice 27 live verification: all cases passed (all fixtures rolled back).'
