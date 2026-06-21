-- K-Work US - Slice 4.5 audit hardening.
--
-- 1. Company ownership never substitutes for the actor's current DB role.
--    A demoted employer keeps public access only, not owner/applicant access.
-- 2. Public job reads use an approved-only view that exposes only the company
--    identity fields required by job cards/search. This avoids making full
--    unverified company rows public just to display an approved job.

-- --- Current-role gates for owner policies ---------------------------------

drop policy if exists companies_select_owner on public.companies;
create policy companies_select_owner on public.companies
  for select using (
    owner_id = auth.uid()
    and (public.is_employer() or public.is_admin())
  );

drop policy if exists jobs_select_owner on public.jobs;
create policy jobs_select_owner on public.jobs
  for select using (
    public.owns_company(company_id)
    and (public.is_employer() or public.is_admin())
  );

drop policy if exists jobs_insert_owner on public.jobs;
create policy jobs_insert_owner on public.jobs
  for insert
  with check (
    public.owns_company(company_id)
    and (public.is_employer() or public.is_admin())
    and moderation_status = 'pending'
  );

drop policy if exists jobs_update_owner on public.jobs;
create policy jobs_update_owner on public.jobs
  for update
  using (
    public.owns_company(company_id)
    and (public.is_employer() or public.is_admin())
  )
  with check (
    public.owns_company(company_id)
    and (public.is_employer() or public.is_admin())
    and moderation_status <> 'approved'
  );

drop policy if exists applications_select_employer on public.applications;
create policy applications_select_employer on public.applications
  for select using (
    (public.is_employer() or public.is_admin())
    and exists (
      select 1
      from public.jobs j
      join public.companies c on c.id = j.company_id
      where j.id = applications.job_id and c.owner_id = auth.uid()
    )
  );

-- --- Safe public read model -------------------------------------------------

create view public.public_job_listings
with (security_barrier = true)
as
select
  j.id,
  j.title,
  j.category,
  j.job_type,
  j.city,
  j.state,
  j.address_display,
  j.address_display_mode,
  j.pay_min,
  j.pay_max,
  j.pay_unit,
  j.tips_available,
  j.schedule_days,
  j.schedule_time_range,
  j.language_requirement,
  j.description,
  j.responsibilities,
  j.requirements,
  j.benefits,
  j.moderation_status,
  j.boost,
  j.posted_at,
  c.name as company_name,
  c.is_verified as company_is_verified
from public.jobs j
join public.companies c on c.id = j.company_id
where j.moderation_status = 'approved';

comment on view public.public_job_listings is
  'Approved public jobs plus safe company identity fields; no private company columns.';

-- Supabase default privileges can be broader than this view needs. Keep it
-- strictly read-only for API callers.
revoke all on public.public_job_listings from public, anon, authenticated;
grant select on public.public_job_listings to anon, authenticated;
