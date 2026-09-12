-- Caller-bound history survives role changes and job closure. Keep B2 admission intact.
drop function public.list_seeker_applications();
drop function public.list_employer_applications();
create function public.list_seeker_applications()
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
  job_is_public boolean,
  application_updated_at timestamptz
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
    public.is_job_open(j.id) as job_is_public,
    a.updated_at as application_updated_at
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  where a.seeker_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;

create function public.list_employer_applications()
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
  job_is_public boolean,
  application_updated_at timestamptz
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
    public.is_job_open(j.id) as job_is_public,
    a.updated_at as application_updated_at
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  join public.profiles p on p.id = a.seeker_id
  join auth.users u on u.id = a.seeker_id
  where public.current_profile_role() = 'employer'
    and c.owner_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;

revoke all on function public.list_seeker_applications() from public, anon;
revoke all on function public.list_employer_applications() from public, anon;
grant execute on function public.list_seeker_applications() to authenticated;
grant execute on function public.list_employer_applications() to authenticated;

create or replace function public.can_access_application_thread(target_application_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id
    where a.id=target_application_id and (
      a.seeker_id=auth.uid()
      or (c.owner_id=auth.uid() and public.current_profile_role()='employer')
      or public.is_admin()
    )
  );
$$;

drop function public.get_application_thread_context(uuid);
create function public.get_application_thread_context(target_application_id uuid)
returns table(application_id uuid, job_id uuid, job_title text, company_name text,
  application_status text, participant_side text, recipient_id uuid)
language sql stable security definer set search_path = ''
as $$
  select a.id,j.id,j.title,c.name,a.status,
    case when a.seeker_id=auth.uid() then 'applicant'
      when c.owner_id=auth.uid() and public.current_profile_role()='employer' then 'employer'
      else 'admin' end,
    case when a.seeker_id=auth.uid() then c.owner_id
      when c.owner_id=auth.uid() and public.current_profile_role()='employer' then a.seeker_id
      else null end
  from public.applications a
  join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id
  where a.id=target_application_id and public.can_access_application_thread(a.id);
$$;
revoke all on function public.get_application_thread_context(uuid) from public, anon;
grant execute on function public.get_application_thread_context(uuid) to authenticated;

drop policy messages_insert_participants on public.messages;
create policy messages_insert_participants on public.messages for insert with check (
  sender_id=auth.uid()
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active')
  and exists(select 1 from public.get_application_thread_context(application_id) ctx
    where ctx.participant_side in ('applicant','employer'))
);

-- Invoker security distinguishes trusted RPC execution from direct REST writes.
-- No client-settable GUC grants a bypass. RLS still binds the owning employer.
create or replace function public.prevent_application_employer_field_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated') and not public.is_admin() then
    if new.id is distinct from old.id or new.job_id is distinct from old.job_id
      or new.seeker_id is distinct from old.seeker_id or new.cover_note is distinct from old.cover_note
      or new.created_at is distinct from old.created_at or new.updated_at is distinct from old.updated_at then
      raise exception 'Only the application status may be changed by an employer' using errcode='42501';
    end if;
    if old.status='withdrawn' or new.status='withdrawn' then
      raise exception 'Applicant withdrawal cannot be changed by an employer' using errcode='42501';
    end if;
    if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then
      raise exception 'Application change not allowed' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.advance_application_revision()
returns trigger language plpgsql set search_path = ''
as $$ begin
  new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond');
  return new;
end; $$;
create trigger applications_zz_advance_revision before update on public.applications
for each row execute function public.advance_application_revision();

create function public.withdraw_application(target_application_id uuid, expected_updated_at timestamptz)
returns table(status text) language plpgsql security definer set search_path = ''
as $$
declare target public.applications%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then
    return query select 'not_allowed'::text; return;
  end if;
  select a.* into target from public.applications a
    where a.id=target_application_id and a.seeker_id=auth.uid() for update;
  if target.id is null then return query select 'not_allowed'::text; return; end if;
  if target.status='withdrawn' then return query select 'already_withdrawn'::text; return; end if;
  if expected_updated_at is distinct from target.updated_at then
    return query select 'conflict'::text; return;
  end if;
  if target.status not in ('submitted','reviewing','interview','offered') then
    return query select 'not_allowed'::text; return;
  end if;
  update public.applications a set status='withdrawn'
    where a.id=target_application_id and a.seeker_id=auth.uid()
      and a.updated_at=expected_updated_at and a.status in ('submitted','reviewing','interview','offered');
  return query select 'withdrawn'::text;
end;
$$;
revoke all on function public.withdraw_application(uuid,timestamptz) from public,anon;
grant execute on function public.withdraw_application(uuid,timestamptz) to authenticated;
