-- ============================================================================
-- Slice 31 — live verification for the expired-job public-visibility invariant
-- ============================================================================
-- Proves, against a REAL Postgres (grants + RLS actually enforced), that after
-- 20260715000000_expired_job_visibility.sql an approved-but-EXPIRED job:
--   A. is absent from public.public_job_listings for anon;
--   B. is unreadable via the public jobs RLS policy for anon;
--   C. cannot receive a new seeker application (insert WITH CHECK fails);
--   D. is STILL visible to its owning employer (history is preserved);
--   E. control — an approved, UNEXPIRED job stays visible to anon and still
--      accepts a seeker application (so the predicate is not over-blocking).
--
-- Run ONLY against a disposable LOCAL stack (never hosted):
--   supabase start && supabase db reset            # applies migrations + seed
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/slice-31-expired-job-visibility.sql
--
-- Self-verifying: each check RAISEs on failure (psql exits non-zero) and emits
-- `PASS <case>` on success. All job mutation and every check run inside ONE
-- transaction that is rolled back, so the seed is left unmutated; only the one
-- throwaway seeker principal provisioned up front persists. Role is simulated
-- via SET LOCAL ROLE + the request.jwt.claims GUC that auth.uid() reads.
-- Depends on supabase/seed.sql (approved job bbbb..0001 owned by employer
-- 1111..; approved job bbbb..0002 owned by employer 2222..).

-- --- Provision a throwaway seeker principal ----------------------------------
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'slice31-seeker@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
-- The on_auth_user_created trigger inserts it as 'seeker' — exactly what we need.

begin;

-- Expire an approved seed job as the table owner (privileged; auth.uid() null).
update public.jobs
  set expires_at = now() - interval '1 day'
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- --- A. anon: expired job absent from the public view ------------------------
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.public_job_listings
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FAIL A: anon saw the expired job in public_job_listings (% rows)', n;
  end if;
  raise notice 'PASS A: expired job absent from public_job_listings for anon';
end $$;

-- --- B. anon: expired job unreadable via the base-table public policy --------
do $$
declare n int;
begin
  select count(*) into n from public.jobs
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FAIL B: anon read the expired job via the jobs policy (% rows)', n;
  end if;
  raise notice 'PASS B: expired job unreadable via the public jobs policy for anon';
end $$;
reset role;

-- --- C. seeker: cannot insert an application for the expired job -------------
select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}',
  true);
set local role authenticated;
do $$
begin
  begin
    insert into public.applications (job_id, seeker_id, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'submitted');
    raise exception 'FAIL C: seeker inserted an application for an expired job';
  exception when insufficient_privilege then
    raise notice 'PASS C: seeker application to the expired job was rejected (%)', sqlerrm;
  end;
end $$;
reset role;

-- --- D. owner employer: expired job still visible (history preserved) --------
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.jobs
    where id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and moderation_status = 'approved';
  if n <> 1 then
    raise exception 'FAIL D: owner cannot see their own expired approved job (% rows)', n;
  end if;
  raise notice 'PASS D: owner still sees their own expired approved job (history)';
end $$;
reset role;

-- --- E. control: approved + unexpired job stays visible and applyable --------
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.public_job_listings
    where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 1 then
    raise exception 'FAIL E1: anon cannot see the approved unexpired job (% rows)', n;
  end if;
  raise notice 'PASS E1: approved unexpired job visible to anon';
end $$;
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}',
  true);
set local role authenticated;
do $$
begin
  insert into public.applications (job_id, seeker_id, status)
  values ('bbbbbbbb-0000-0000-0000-000000000002',
          '66666666-6666-6666-6666-666666666666', 'submitted');
  raise notice 'PASS E2: seeker application to the approved unexpired job accepted';
end $$;
reset role;

rollback;

\echo 'Slice 31 live verification: all cases passed.'
