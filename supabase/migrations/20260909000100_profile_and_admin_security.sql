-- Auth session assurance, trusted suspension status, and verified contact source.
alter table public.profiles
  add column account_status text not null default 'active'
  check (account_status in ('active', 'suspended'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
    and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_status = 'active'
    );
$$;

create or replace function public.guard_profile_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'account_status is a trusted field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_account_status
before update of account_status on public.profiles
for each row execute function public.guard_profile_status_change();

create or replace function public.can_access_application_thread(target_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.companies c on c.id = j.company_id
    where a.id = target_application_id
      and (
        (public.current_profile_role() = 'seeker' and a.seeker_id = auth.uid())
        or (public.current_profile_role() = 'employer' and c.owner_id = auth.uid())
        or public.is_admin()
      )
  );
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
    case when u.email_confirmed_at is not null then u.email else null end as applicant_email,
    a.status as application_status,
    a.cover_note,
    a.created_at as submitted_at,
    j.moderation_status = 'approved' as job_is_public
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  join public.profiles p on p.id = a.seeker_id
  join auth.users u on u.id = a.seeker_id
  where public.current_profile_role() = 'employer'
    and c.owner_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;
