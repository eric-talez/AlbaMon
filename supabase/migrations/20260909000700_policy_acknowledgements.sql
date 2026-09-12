-- No backfill: Auth bootstrap and existing accounts do not imply acceptance.
alter table public.profiles add column terms_version text, add column terms_accepted_at timestamptz,
  add column privacy_notice_version text, add column privacy_notice_acknowledged_at timestamptz;
alter table public.jobs add column posting_policy_version text, add column posting_policy_acknowledged_at timestamptz;

-- Invoker: ordinary REST cannot claim consent or set its clock. The explicit
-- self RPC below runs as owner, while C2 still checks the actual active actor.
create function public.guard_profile_acknowledgements()
returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if current_user in ('anon','authenticated') then
    if (new.terms_version,new.terms_accepted_at,new.privacy_notice_version,new.privacy_notice_acknowledged_at)
      is distinct from (old.terms_version,old.terms_accepted_at,old.privacy_notice_version,old.privacy_notice_acknowledged_at) then
      raise exception 'Policy fields require explicit self acknowledgement' using errcode='42501';
    end if;
  end if;
  if auth.role()='authenticated' and (current_user in ('anon','authenticated') or new.id is distinct from auth.uid()) then
    if not exists(select 1 from public.profiles where id=auth.uid() and terms_version='ca-launch-v1' and terms_accepted_at is not null
       and privacy_notice_version='ca-launch-v1' and privacy_notice_acknowledged_at is not null) then
      raise exception 'policy_acknowledgement_required' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
create trigger profiles_policy_acknowledgements before update on public.profiles
for each row execute function public.guard_profile_acknowledgements();

create function public.acknowledge_policies(terms text, agree_terms boolean, privacy_notice text, confirm_privacy_notice boolean)
returns void language plpgsql security definer set search_path='' as $$
declare accepted_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null or agree_terms is distinct from true or confirm_privacy_notice is distinct from true
     or terms is distinct from 'ca-launch-v1' or privacy_notice is distinct from 'ca-launch-v1' then
    raise exception 'Explicit current policy acknowledgement required' using errcode='42501';
  end if;
  update public.profiles set terms_version=terms,
    terms_accepted_at=case when terms_version=terms and terms_accepted_at is not null then terms_accepted_at else accepted_at end,
    privacy_notice_version=privacy_notice,
    privacy_notice_acknowledged_at=case when privacy_notice_version=privacy_notice and privacy_notice_acknowledged_at is not null
      then privacy_notice_acknowledged_at else accepted_at end
    where id=auth.uid() and account_status='active';
  if not found then raise exception 'account_suspended' using errcode='42501'; end if;
end; $$;
revoke all on function public.acknowledge_policies(text,boolean,text,boolean) from public,anon,service_role;
grant execute on function public.acknowledge_policies(text,boolean,text,boolean) to authenticated;

-- Actual API role is essential inside RPCs/security-definer triggers. Read-only
-- history remains accessible. Controlled imports are not consent evidence.
create function public.guard_policy_writer()
returns trigger language plpgsql volatile security definer set search_path='' as $$ begin
  if auth.role()='service_role' or (auth.uid() is null and session_user='postgres'
      and current_setting('role') not in ('anon','authenticated')) then return new; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and terms_version='ca-launch-v1'
    and terms_accepted_at is not null and privacy_notice_version='ca-launch-v1' and privacy_notice_acknowledged_at is not null) then
    raise exception 'policy_acknowledgement_required' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger companies_policy_writer before insert or update on public.companies for each row execute function public.guard_policy_writer();
create trigger jobs_policy_writer before insert or update on public.jobs for each row execute function public.guard_policy_writer();
create trigger applications_policy_writer before insert or update on public.applications for each row execute function public.guard_policy_writer();
create trigger messages_policy_writer before insert on public.messages for each row execute function public.guard_policy_writer();
create trigger reports_policy_writer before insert or update on public.reports for each row execute function public.guard_policy_writer();
create trigger employer_access_policy_writer before insert or update on public.employer_access_requests for each row execute function public.guard_policy_writer();

create function public.guard_posting_acknowledgement()
returns trigger language plpgsql security invoker set search_path='' as $$ begin
  -- B2 RPC lifecycle decisions do not fabricate an employer acknowledgement.
  -- Resubmission requires an existing current acknowledgement; editing the
  -- submission supplies it. Trusted imports remain explicit fixture scope.
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if new.posting_policy_acknowledged_at is not null then
        raise exception 'Posting acknowledgement clock is trusted' using errcode='42501';
      end if;
    elsif new.posting_policy_acknowledged_at is distinct from old.posting_policy_acknowledged_at then
      raise exception 'Posting acknowledgement clock is trusted' using errcode='42501';
    end if;
    if not public.is_admin() then
      if new.posting_policy_version is distinct from 'ca-launch-v1' then
        raise exception 'posting_policy_acknowledgement_required' using errcode='42501';
      end if;
      if tg_op='INSERT' then new.posting_policy_acknowledged_at:=clock_timestamp();
      elsif old.posting_policy_version is distinct from new.posting_policy_version or old.posting_policy_acknowledged_at is null then
        new.posting_policy_acknowledged_at:=clock_timestamp();
      end if;
    elsif tg_op='UPDATE' and new.posting_policy_version is distinct from old.posting_policy_version then
      raise exception 'Employer must acknowledge posting policy' using errcode='42501';
    end if;
  elsif auth.role()='authenticated' and new.moderation_status='pending' and public.current_profile_role()='employer'
    and (new.posting_policy_version is distinct from 'ca-launch-v1' or new.posting_policy_acknowledged_at is null) then
    raise exception 'posting_policy_acknowledgement_required' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger jobs_posting_acknowledgement before insert or update on public.jobs for each row execute function public.guard_posting_acknowledgement();
revoke all on function public.guard_profile_acknowledgements(),public.guard_policy_writer(),public.guard_posting_acknowledgement() from public,anon,authenticated,service_role;

-- Operational reads only: one parameter-bound snapshot, counts without content.
-- No deletion RPC. The dependency counts are a stop signal, not a retention rule.
create function public.privacy_request_impact(subject_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
with owned_companies as (select id from public.companies where owner_id=subject_id),
owned_jobs as (select id from public.jobs where company_id in(select id from owned_companies)),
threads as (select id,seeker_id from public.applications where seeker_id=subject_id or job_id in(select id from owned_jobs)),
queue as (select id from public.notification_outbox where recipient_id=subject_id)
select jsonb_build_object(
 'auth_users',(select count(*) from auth.users where id=subject_id),
 'profiles',(select count(*) from public.profiles where id=subject_id),
 'companies',(select count(*) from owned_companies),'jobs',(select count(*) from owned_jobs),
 'applications',(select count(*) from threads),
 'third_party_applications',(select count(*) from threads where seeker_id<>subject_id),
 'messages',(select count(*) from public.messages where sender_id=subject_id or application_id in(select id from threads)),
 'third_party_messages',(select count(*) from public.messages where sender_id<>subject_id and application_id in(select id from threads)),
 'reports_cascade',(select count(*) from public.reports where job_id in(select id from owned_jobs) or company_id in(select id from owned_companies)),
 'reports_reporter_unlinked',(select count(*) from public.reports where reporter_id=subject_id),
 'access_requests',(select count(*) from public.employer_access_requests where requester_id=subject_id),
 'access_reviews_unlinked',(select count(*) from public.employer_access_requests where reviewed_by=subject_id),
 'audits_actor_unlinked',(select count(*) from public.audit_logs where actor_id=subject_id),
 'notification_outbox',(select count(*) from queue),
 'webhook_receipts',(select count(*) from public.email_webhook_receipts where outbox_id in(select id from queue))
); $$;

-- Candidate export, never automatic delivery. Omit other participants' identity,
-- notes, messages, internal review metadata, Auth tokens, and provider payloads.
-- Operator must additionally review requester-authored free text for third parties.
create function public.privacy_request_access(subject_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'account',(select jsonb_build_object('id',id,'email',email,'email_confirmed_at',email_confirmed_at,'created_at',created_at) from auth.users where id=subject_id),
 'profile',(select to_jsonb(p) from (select display_name,phone,city,state,role,account_status,email_notifications_enabled,suppressed_email,terms_version,terms_accepted_at,privacy_notice_version,privacy_notice_acknowledged_at,created_at,updated_at from public.profiles where id=subject_id) p),
 'companies',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,name,description,website,phone,city,state,address_display,is_verified,created_at,updated_at from public.companies where owner_id=subject_id) c),'[]'),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from (select id,company_id,title,category,job_type,description,responsibilities,requirements,benefits,city,state,address_display,address_display_mode,pay_min,pay_max,pay_unit,tips_available,schedule_days,schedule_time_range,language_requirement,moderation_status,posted_at,expires_at,created_at,updated_at,posting_policy_version,posting_policy_acknowledged_at from public.jobs where company_id in(select id from public.companies where owner_id=subject_id)) j),'[]'),
 'own_applications',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,job_id,status,cover_note,created_at,updated_at from public.applications where seeker_id=subject_id) a),'[]'),
 'received_application_summary',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,job_id,status,created_at from public.applications where seeker_id<>subject_id and job_id in(select j.id from public.jobs j join public.companies c on c.id=j.company_id where c.owner_id=subject_id)) a),'[]'),
 'own_messages',coalesce((select jsonb_agg(to_jsonb(m)) from (select id,application_id,body,created_at from public.messages where sender_id=subject_id) m),'[]'),
 'own_reports',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,job_id,company_id,reason,details,status,created_at from public.reports where reporter_id=subject_id) r),'[]'),
 'access_requests',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,business_name,contact_name,phone,website,city,state,reason,status,created_at from public.employer_access_requests where requester_id=subject_id) r),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from (select id,kind,status,created_at from public.notification_outbox where recipient_id=subject_id) n),'[]')
); $$;
revoke all on function public.privacy_request_impact(uuid),public.privacy_request_access(uuid) from public,anon,authenticated;
grant execute on function public.privacy_request_impact(uuid),public.privacy_request_access(uuid) to service_role;
