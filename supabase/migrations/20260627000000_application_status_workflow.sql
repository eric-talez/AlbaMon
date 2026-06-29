-- Slice 10: employer-managed application status workflow.
--
-- Adds the smallest surface needed for an employer to move an application
-- through a fixed lifecycle (submitted -> reviewing -> interview -> offered /
-- rejected / withdrawn) for jobs under companies they own. Seekers still have no update
-- path; admin behavior is unchanged (the pre-existing applications_update_admin
-- policy and is_admin() bypass remain the trusted admin route).
--
-- The status string values MUST stay in sync with APPLICATION_STATUSES in
-- src/lib/types.ts (enforced by tests/db-schema.test.ts).

-- 1. Data integrity: constrain status to the supported workflow values for any
--    writer. Existing rows are seeded/created as 'submitted'. Add NOT VALID
--    first, verify no offending rows, then validate (mirrors the cover-note
--    constraint added in Slice 5).
alter table public.applications
  add constraint applications_status_allowed
  check (status in ('submitted', 'reviewing', 'interview', 'offered', 'rejected', 'withdrawn'))
  not valid;

do $$
declare
  invalid_count bigint;
begin
  select count(*) into invalid_count
  from public.applications
  where status not in ('submitted', 'reviewing', 'interview', 'offered', 'rejected', 'withdrawn');

  if invalid_count > 0 then
    raise exception
      'Cannot validate applications_status_allowed: % existing rows have an unsupported status',
      invalid_count;
  end if;
end
$$;

alter table public.applications
  validate constraint applications_status_allowed;

-- 2. Allow the owning employer (current DB role 'employer', or an admin) to
--    update applications for jobs under companies they own. WITH CHECK keeps
--    ownership after the change and keeps the status within the supported set.
--    Ownership is re-derived from auth.uid() + companies.owner_id, never from a
--    client-supplied field. Seekers have no update policy, so they are blocked.
create policy applications_update_employer on public.applications
  for update
  using (
    (public.is_employer() or public.is_admin())
    and exists (
      select 1
      from public.jobs j
      join public.companies c on c.id = j.company_id
      where j.id = applications.job_id and c.owner_id = auth.uid()
    )
  )
  with check (
    (public.is_employer() or public.is_admin())
    and exists (
      select 1
      from public.jobs j
      join public.companies c on c.id = j.company_id
      where j.id = applications.job_id and c.owner_id = auth.uid()
    )
    and status in ('submitted', 'reviewing', 'interview', 'offered', 'rejected', 'withdrawn')
  );

-- 3. Defense in depth: an employer (non-admin, non-service-role) may change ONLY
--    the status column on an application — never the applicant, the job, the
--    cover note, or the submission time. This protects seeker-authored content
--    and ownership even if the update policy is ever loosened. Admins and
--    trusted server-side flows (service role / migrations / seed) pass through,
--    matching the verification/boost guards added in earlier slices.
create or replace function public.prevent_application_employer_field_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin()
     and (
       new.job_id is distinct from old.job_id
       or new.seeker_id is distinct from old.seeker_id
       or new.cover_note is distinct from old.cover_note
       or new.created_at is distinct from old.created_at
       or new.updated_at is distinct from old.updated_at
     ) then
    raise exception 'Only the application status may be changed by an employer'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_prevent_employer_field_change on public.applications;
create trigger applications_prevent_employer_field_change
  before update on public.applications
  for each row execute function public.prevent_application_employer_field_change();
