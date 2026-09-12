-- Reviewed publication, optimistic lifecycle writes, and atomic admission.
-- Hosted legacy rows are intentionally not extended or assigned publication dates.
alter table public.jobs alter column posted_at drop default;

create or replace function public.is_job_open(target_job_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    join public.companies c on c.id = j.company_id
    join public.profiles p on p.id = c.owner_id
    where j.id = target_job_id and j.state = 'CA'
      and j.moderation_status = 'approved' and j.expires_at > now()
      and p.account_status = 'active'
  );
$$;
revoke all on function public.is_job_open(uuid) from public;
grant execute on function public.is_job_open(uuid) to anon, authenticated;

drop policy if exists jobs_select_public_approved on public.jobs;
create policy jobs_select_public_approved on public.jobs for select using (public.is_job_open(id));
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
  c.is_verified as company_is_verified,
  j.expires_at,
  j.updated_at
from public.jobs j
join public.companies c on c.id = j.company_id
where public.is_job_open(j.id);


-- Invoker security is intentional: RPCs run as their owner, REST as authenticated.
-- A client-controlled GUC is never used as an authorization bypass.
create or replace function public.guard_job_edit()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if auth.uid() is null or public.current_profile_role() <> 'employer'
       or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') then
      raise exception 'Job write not allowed' using errcode='42501';
    end if;
    if tg_op = 'INSERT' then
      if new.posted_at is not null or new.expires_at is not null then
        raise exception 'Publication fields are trusted' using errcode='42501';
      end if;
      new.created_at := now();
      new.updated_at := now();
    else
      if new.id is distinct from old.id or new.company_id is distinct from old.company_id
         or new.boost is distinct from old.boost or new.posted_at is distinct from old.posted_at
         or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at
         or (new.moderation_status is distinct from old.moderation_status and new.moderation_status <> 'pending') then
        raise exception 'Job lifecycle fields are trusted' using errcode='42501';
      end if;
      new.moderation_status := 'pending';
    end if;
  end if;
  return new;
end;
$$;
create trigger jobs_00_guard_edit before insert or update on public.jobs
for each row execute function public.guard_job_edit();

-- Runs after the old now()-based timestamp trigger. Tokens advance even within
-- one transaction, when now() is constant, or after a clock adjustment.
create or replace function public.advance_job_revision()
returns trigger language plpgsql set search_path = ''
as $$ begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end; $$;
create trigger jobs_zz_advance_revision before update on public.jobs
for each row execute function public.advance_job_revision();

create or replace function public.audit_job_lifecycle()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'companies' then
    if new.is_verified is distinct from old.is_verified then
      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
      values(auth.uid(),'company.verification_changed','company',new.id,
        jsonb_build_object('previous',old.is_verified,'current',new.is_verified),clock_timestamp());
    end if;
  elsif new.moderation_status is distinct from old.moderation_status
        or new.posted_at is distinct from old.posted_at or new.expires_at is distinct from old.expires_at then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
    values(auth.uid(),case when new.moderation_status is distinct from old.moderation_status
      then 'job.' || new.moderation_status::text else 'job.publication_changed' end,'job',new.id,
      jsonb_build_object('previous',old.moderation_status,'current',new.moderation_status,
        'reason',nullif(current_setting('app.job_review_reason',true),'')),clock_timestamp());
  end if;
  return new;
end;
$$;
create trigger jobs_audit_lifecycle after update on public.jobs
for each row execute function public.audit_job_lifecycle();
create trigger companies_audit_verification after update of is_verified on public.companies
for each row execute function public.audit_job_lifecycle();

create or replace function public.transition_job(target_job_id uuid, command text, expected_updated_at timestamptz, reason text default null)
returns table(status text, job_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  target public.jobs%rowtype;
  administrator boolean;
  owner_employer boolean;
  next_status public.moderation_status;
  prior_reason text;
begin
  select j.* into target from public.jobs j where j.id=target_job_id for update;
  administrator := public.is_admin();
  owner_employer := public.current_profile_role()='employer'
    and exists(select 1 from public.companies c join public.profiles p on p.id=c.owner_id
      where c.id=target.company_id and c.owner_id=auth.uid() and p.account_status='active');
  if target.id is null or auth.uid() is null or not (administrator or coalesce(owner_employer,false)) then
    return query select 'not_allowed'::text,target_job_id; return;
  end if;
  if expected_updated_at is distinct from target.updated_at then
    return query select 'conflict'::text,target_job_id; return;
  end if;
  -- Explicit actor/source matrix; no catch-all status assignment.
  if administrator and command in ('approve','reject') and target.moderation_status='pending' then
    next_status := case when command='approve' then 'approved'::public.moderation_status else 'rejected'::public.moderation_status end;
  elsif command='pause' and ((administrator and target.moderation_status='approved')
    or (owner_employer and target.moderation_status not in ('paused','expired'))) then next_status := 'paused';
  elsif owner_employer and command='close' and target.moderation_status <> 'expired' then next_status := 'expired';
  elsif owner_employer and command='resubmit' and target.moderation_status in ('draft','rejected','paused','expired') then next_status := 'pending';
  else return query select 'not_allowed'::text,target_job_id; return;
  end if;
  if administrator and command in ('reject','pause') then
    if reason is null or char_length(btrim(reason)) not between 1 and 500 then
      return query select 'not_allowed'::text,target_job_id; return;
    end if;
  elsif reason is not null and btrim(reason) <> '' then
    return query select 'not_allowed'::text,target_job_id; return;
  end if;
  prior_reason := current_setting('app.job_review_reason',true);
  perform set_config('app.job_review_reason',case when administrator and command in ('reject','pause') then btrim(reason) else '' end,true);
  update public.jobs set moderation_status=next_status,
    posted_at=case when command='approve' then now() else target.posted_at end,
    expires_at=case when command='approve' then now()+interval '30 days'
                    when command='close' then now() else target.expires_at end
  where id=target_job_id;
  perform set_config('app.job_review_reason',coalesce(prior_reason,''),true);
  return query select 'updated'::text,target_job_id;
end;
$$;
revoke all on function public.transition_job(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.transition_job(uuid,text,timestamptz,text) to authenticated;

create or replace function public.get_job_review_note(target_job_id uuid)
returns table(reason text, reviewed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.metadata->>'reason',a.created_at from public.audit_logs a
  where a.entity_type='job' and a.entity_id=target_job_id
    and a.action in ('job.rejected','job.paused')
    and a.metadata->>'reason' is not null
    and (public.is_admin() or (public.current_profile_role()='employer' and exists(
      select 1 from public.jobs j join public.companies c on c.id=j.company_id
      join public.profiles p on p.id=c.owner_id
      where j.id=target_job_id and c.owner_id=auth.uid() and p.account_status='active')))
  order by a.created_at desc,a.id desc limit 1;
$$;
revoke all on function public.get_job_review_note(uuid) from public,anon;
grant execute on function public.get_job_review_note(uuid) to authenticated;

-- VOLATILE is required: the predicate's statement gets a fresh snapshot after
-- any wait on the job lock. RLS alone would retain the INSERT snapshot.
create or replace function public.guard_application_admission()
returns trigger language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform 1 from public.jobs j where j.id=new.job_id for update;
  if auth.role()='service_role' or (auth.uid() is null and session_user='postgres' and current_setting('role') not in ('anon','authenticated')) then
    return new; -- controlled local fixtures / trusted operational imports only
  end if;
  if auth.uid() is null or new.seeker_id is distinct from auth.uid()
     or public.current_profile_role() <> 'seeker' or new.status <> 'submitted'
     or not public.is_job_open(new.job_id) then
    raise exception 'Application not allowed' using errcode='42501';
  end if;
  new.seeker_id := auth.uid();
  return new;
end;
$$;
create trigger applications_guard_admission before insert on public.applications
for each row execute function public.guard_application_admission();

drop policy if exists applications_insert_seeker on public.applications;
create policy applications_insert_seeker on public.applications for insert with check (
  seeker_id=auth.uid() and public.current_profile_role()='seeker' and status='submitted'
  and public.is_job_open(job_id)
);
drop policy if exists reports_insert_authenticated on public.reports;
create policy reports_insert_authenticated on public.reports for insert with check (
  auth.uid() is not null and reporter_id=auth.uid() and job_id is not null and status='open'
  and reason in ('discriminatory_language','visa_status_preference','illegal_cash_pay','misleading_or_suspicious','spam','other')
  and (details is null or char_length(details)<=1000) and public.is_job_open(job_id)
);
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
    public.is_job_open(j.id) as job_is_public
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
    case when u.email_confirmed_at is not null then u.email else null end as applicant_email,
    a.status as application_status,
    a.cover_note,
    a.created_at as submitted_at,
    public.is_job_open(j.id) as job_is_public
  from public.applications a
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  join public.profiles p on p.id = a.seeker_id
  join auth.users u on u.id = a.seeker_id
  where public.current_profile_role() = 'employer'
    and c.owner_id = auth.uid()
  order by a.created_at desc, a.id desc;
$$;
