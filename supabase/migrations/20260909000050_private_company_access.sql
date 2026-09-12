-- Public job cards use public_job_listings' safe company identity projection.
-- RLS filters rows, not columns: verified companies must not expose owner/phone.
-- Keep authenticated grants for the existing owner/admin policies and writes.
drop policy if exists companies_select_public_verified on public.companies;
revoke select on table public.companies from public, anon;
