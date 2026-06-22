-- Slice 6: least-privilege application listing RPCs.
--
-- These functions intentionally bypass table RLS only inside tightly scoped,
-- caller-bound queries. They derive identity from auth.uid(), re-check the
-- runtime profiles.role, and expose only the fields required by the dashboards.

create or replace function public.list_seeker_applications()
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  company_name text,
  job_city text,
  job_state text,
  application_status text,
  cover_note text,
  submitted_at timestamptz,
  job_is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id as application_id,
    j.id as job_id,
    j.title as job_title,
    c.name as company_name,
    j.city as job_city,
    j.state as job_state,
    a.status as application_status,
    a.cover_note,
    a.created_at as submitted_at,
    j.moderation_status = 'approved' as job_is_public
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  where public.current_profile_role() = 'seeker'
    and a.seeker_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;

create or replace function public.list_employer_applications()
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  company_name text,
  applicant_display_name text,
  applicant_email text,
  application_status text,
  cover_note text,
  submitted_at timestamptz,
  job_is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id as application_id,
    j.id as job_id,
    j.title as job_title,
    c.name as company_name,
    p.display_name as applicant_display_name,
    p.email as applicant_email,
    a.status as application_status,
    a.cover_note,
    a.created_at as submitted_at,
    j.moderation_status = 'approved' as job_is_public
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  join public.profiles p on p.id = a.seeker_id
  where public.current_profile_role() = 'employer'
    and c.owner_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;

comment on function public.list_seeker_applications() is
  'Caller-bound seeker application history with safe job/company display fields.';
comment on function public.list_employer_applications() is
  'Employer-owned job applications with applicant display name and email only.';

revoke all on function public.list_seeker_applications() from public, anon, authenticated;
revoke all on function public.list_employer_applications() from public, anon, authenticated;
grant execute on function public.list_seeker_applications() to authenticated;
grant execute on function public.list_employer_applications() to authenticated;
