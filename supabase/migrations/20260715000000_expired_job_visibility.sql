-- Slice 31: Expired job visibility and application cutoff.
--
-- Make job expiration a complete, database-backed public-visibility invariant.
-- An expired job may stay moderation_status = 'approved' so it remains in
-- employer/admin history, but it must not be publicly visible and must not
-- accept new seeker applications. The single invariant, applied identically to
-- the public read policy, the public view, and the seeker insert policy, is:
--
--     moderation_status = 'approved'
--     AND (expires_at IS NULL OR expires_at > now())
--
-- Owner/admin policies (jobs_select_owner, jobs_select_admin, jobs_update_*) are
-- deliberately left untouched: they never gate on expiry, so an expired job
-- stays fully manageable for its owner and admins. moderation_status is not
-- mutated here; expiry is a time comparison, not a status transition.

-- --- Public/anon base-table read: approved AND unexpired ---------------------
-- Supersedes the Slice 3 init_schema definition (approved-only).
drop policy if exists jobs_select_public_approved on public.jobs;
create policy jobs_select_public_approved on public.jobs
  for select using (
    moderation_status = 'approved'
    and (expires_at is null or expires_at > now())
  );

-- --- Public view: same predicate, everything else preserved ------------------
-- CREATE OR REPLACE keeps the view's grants, comment, owner, and definer-rights
-- behavior; the column list is copied verbatim from 20260622000000 (unchanged),
-- so only the WHERE clause gains the unexpired predicate. expires_at is NOT
-- exposed as a column: the database view stays the configured-runtime authority
-- for filtering, not an app-side field.
create or replace view public.public_job_listings
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
where j.moderation_status = 'approved'
  and (j.expires_at is null or j.expires_at > now());

comment on view public.public_job_listings is
  'Approved, unexpired public jobs plus safe company identity fields; no private company columns.';

-- Re-affirm the least-privilege, read-only grants so the net/latest view
-- definition carries its own privilege record (CREATE OR REPLACE already
-- preserves them; this restatement keeps anon/authenticated SELECT unchanged
-- and never broadens access).
revoke all on public.public_job_listings from public, anon, authenticated;
grant select on public.public_job_listings to anon, authenticated;

-- --- Seeker application insert: cannot apply to an expired job ---------------
-- Supersedes the Slice 5 definition; seeker role, auth.uid() self-check,
-- submitted-status guard, and the unique(job_id, seeker_id) constraint are
-- unchanged. Only the correlated approved-job check gains the unexpired
-- predicate, so a direct PostgREST/RLS insert against an expired job fails the
-- WITH CHECK.
drop policy if exists applications_insert_seeker on public.applications;
create policy applications_insert_seeker on public.applications
  for insert
  with check (
    seeker_id = auth.uid()
    and public.current_profile_role() = 'seeker'
    and status = 'submitted'
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.moderation_status = 'approved'
        and (j.expires_at is null or j.expires_at > now())
    )
  );
