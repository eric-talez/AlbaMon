-- ============================================================================
-- Slice 25 — live role-scoped verification for the companies read restriction
-- ============================================================================
-- Proves, against a REAL Postgres (grants + RLS actually enforced), that after
-- 20260713000000_restrict_company_public_reads.sql:
--   A. anon cannot read the public.companies base table at all;
--   B. anon can still read approved jobs via public.public_job_listings;
--   C. an ordinary authenticated seeker reads zero company rows;
--   D. an employer reads only their own company;
--   E. an admin reads all companies.
--
-- Run ONLY against a disposable LOCAL stack (never hosted):
--   supabase start && supabase db reset            # applies migrations + seed
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/slice-25-company-read-restriction.sql
--
-- Self-verifying: each check RAISEs on failure (psql exits non-zero) and emits
-- `PASS <case>` on success. Role is simulated via SET LOCAL ROLE + the
-- request.jwt.claims GUC that Supabase's auth.uid() reads; every check runs in
-- its own transaction and is rolled back, so this script mutates nothing except
-- the two throwaway test principals it provisions up front.
-- Depends on supabase/seed.sql (employer 1111.. owns company aaaa..0001).

-- --- Provision throwaway seeker + admin principals ---------------------------
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'slice25-seeker@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'slice25-admin@example.com',
   crypt('x', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

-- The on_auth_user_created trigger inserts both as 'seeker'. Promote one to
-- admin as the table owner (auth.uid() is null here, so the role-lock trigger
-- allows it — the same path DEPLOYMENT.md §5 uses for the founding admin).
update public.profiles set role = 'admin'
  where id = '55555555-5555-5555-5555-555555555555';

-- --- A. anon: base-table SELECT denied ---------------------------------------
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.companies limit 1;
    raise exception 'FAIL A: anon read public.companies (expected permission denied)';
  exception when insufficient_privilege then
    raise notice 'PASS A: anon denied on public.companies (%)', sqlerrm;
  end;
end $$;
rollback;

-- --- B. anon: approved jobs still readable via the view ----------------------
begin;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.public_job_listings;
  if n <= 0 then
    raise exception 'FAIL B: anon read % rows from public_job_listings (expected > 0)', n;
  end if;
  raise notice 'PASS B: anon reads public_job_listings (% approved rows)', n;
end $$;
rollback;

-- --- C. authenticated seeker: zero company rows ------------------------------
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.companies;
  if n <> 0 then
    raise exception 'FAIL C: seeker read % company rows (expected 0)', n;
  end if;
  raise notice 'PASS C: seeker reads 0 company rows';
end $$;
rollback;

-- --- D. employer: only their own company -------------------------------------
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true);
set local role authenticated;
do $$
declare n int; owned int;
begin
  select count(*) into n from public.companies;
  select count(*) into owned from public.companies
    where owner_id = '11111111-1111-1111-1111-111111111111';
  if n <> 1 or owned <> 1 then
    raise exception 'FAIL D: employer saw % rows (% owned); expected 1 own only', n, owned;
  end if;
  raise notice 'PASS D: employer reads only their own company (%)', n;
end $$;
rollback;

-- --- E. admin: all companies -------------------------------------------------
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}',
  true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.companies;
  if n < 3 then
    raise exception 'FAIL E: admin read % company rows (expected >= 3 seeded)', n;
  end if;
  raise notice 'PASS E: admin reads all companies (%)', n;
end $$;
rollback;

\echo 'Slice 25 live verification: all cases passed.'
