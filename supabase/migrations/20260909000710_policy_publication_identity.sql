-- Exact content identity is separate from the required ca-launch-v1 versions.
-- No acknowledgement backfill. This initial pointer identifies only the shipped draft.
alter table public.profiles add column policy_identity text;
alter table public.jobs add column posting_policy_identity text;
create table public.policy_publication (
  singleton boolean primary key default true check(singleton),
  identity text not null check(identity ~ '^(draft|reviewed):[0-9a-f]{64}$')
);
alter table public.policy_publication enable row level security;
revoke all on public.policy_publication from anon,authenticated,service_role;
insert into public.policy_publication(identity) values('draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7');

-- The share lock serializes activation against acknowledged writes. No personal
-- data is exposed; anonymous release preflight can read the public identity.
create function public.current_policy_identity() returns text
language sql volatile security definer set search_path='' as $$
  select identity from public.policy_publication where singleton for share;
$$;
revoke all on function public.current_policy_identity() from public;
grant execute on function public.current_policy_identity() to anon,authenticated,service_role;
create function public.activate_policy_publication(expected_identity text,next_identity text) returns void
language plpgsql security definer set search_path='' as $$ begin
  if next_identity is null or next_identity !~ '^(draft|reviewed):[0-9a-f]{64}$' then
    raise exception 'Invalid policy identity' using errcode='22023';
  end if;
  update public.policy_publication set identity=next_identity where singleton and identity=expected_identity;
  if not found then raise exception 'Policy publication conflict' using errcode='40001'; end if;
  if expected_identity is distinct from next_identity then
    insert into public.audit_logs(action,entity_type,metadata)
    values('policy.publication_changed','policy_publication',jsonb_build_object('previous',expected_identity,'current',next_identity));
  end if;
end; $$;
revoke all on function public.activate_policy_publication(text,text) from public,anon,authenticated;
grant execute on function public.activate_policy_publication(text,text) to service_role;

create or replace function public.guard_profile_acknowledgements()
returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if current_user in ('anon','authenticated') then
    if (new.terms_version,new.terms_accepted_at,new.privacy_notice_version,new.privacy_notice_acknowledged_at,new.policy_identity)
      is distinct from (old.terms_version,old.terms_accepted_at,old.privacy_notice_version,old.privacy_notice_acknowledged_at,old.policy_identity) then
      raise exception 'Policy fields require explicit self acknowledgement' using errcode='42501';
    end if;
  end if;
  if auth.role()='authenticated' and (current_user in ('anon','authenticated') or new.id is distinct from auth.uid()) then
    if not exists(select 1 from public.profiles where id=auth.uid() and terms_version='ca-launch-v1' and terms_accepted_at is not null
       and privacy_notice_version='ca-launch-v1' and privacy_notice_acknowledged_at is not null
       and policy_identity=public.current_policy_identity()) then
      raise exception 'policy_acknowledgement_required' using errcode='42501';
    end if;
  end if;
  return new;
end; $$;
-- Old clients cannot acknowledge content they did not identify.
create or replace function public.acknowledge_policies(terms text,agree_terms boolean,privacy_notice text,confirm_privacy_notice boolean)
returns void language plpgsql security definer set search_path='' as $$ begin
  raise exception 'Explicit policy publication identity required' using errcode='42501';
end; $$;
create function public.acknowledge_policies(terms text,agree_terms boolean,privacy_notice text,confirm_privacy_notice boolean,publication_identity text)
returns void language plpgsql security definer set search_path='' as $$
declare accepted_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null or agree_terms is distinct from true or confirm_privacy_notice is distinct from true
     or terms is distinct from 'ca-launch-v1' or privacy_notice is distinct from 'ca-launch-v1'
     or publication_identity is null or publication_identity is distinct from public.current_policy_identity() then
    raise exception 'Explicit current policy acknowledgement required' using errcode='42501';
  end if;
  update public.profiles set terms_version=terms,
    terms_accepted_at=case when policy_identity=publication_identity and terms_version=terms and terms_accepted_at is not null then terms_accepted_at else accepted_at end,
    privacy_notice_version=privacy_notice,
    privacy_notice_acknowledged_at=case when policy_identity=publication_identity and privacy_notice_version=privacy_notice and privacy_notice_acknowledged_at is not null
      then privacy_notice_acknowledged_at else accepted_at end,
    policy_identity=publication_identity
    where id=auth.uid() and account_status='active';
  if not found then raise exception 'account_suspended' using errcode='42501'; end if;
end; $$;
revoke all on function public.acknowledge_policies(text,boolean,text,boolean,text) from public,anon,service_role;
grant execute on function public.acknowledge_policies(text,boolean,text,boolean,text) to authenticated;

create or replace function public.guard_policy_writer()
returns trigger language plpgsql volatile security definer set search_path='' as $$ begin
  if auth.role()='service_role' or (auth.uid() is null and session_user='postgres'
      and current_setting('role') not in ('anon','authenticated')) then return new; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and terms_version='ca-launch-v1'
    and terms_accepted_at is not null and privacy_notice_version='ca-launch-v1' and privacy_notice_acknowledged_at is not null
    and policy_identity=public.current_policy_identity()) then
    raise exception 'policy_acknowledgement_required' using errcode='42501';
  end if;
  return new;
end; $$;
create or replace function public.guard_posting_acknowledgement()
returns trigger language plpgsql security invoker set search_path='' as $$ begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then
      if new.posting_policy_acknowledged_at is not null then
        raise exception 'Posting acknowledgement clock is trusted' using errcode='42501';
      end if;
    elsif new.posting_policy_acknowledged_at is distinct from old.posting_policy_acknowledged_at then
      raise exception 'Posting acknowledgement clock is trusted' using errcode='42501';
    end if;
    if not public.is_admin() then
      if new.posting_policy_version is distinct from 'ca-launch-v1' or new.posting_policy_identity is null
        or new.posting_policy_identity is distinct from public.current_policy_identity() then
        raise exception 'posting_policy_acknowledgement_required' using errcode='42501';
      end if;
      if tg_op='INSERT' then new.posting_policy_acknowledged_at:=clock_timestamp();
      elsif old.posting_policy_version is distinct from new.posting_policy_version or old.posting_policy_identity is distinct from new.posting_policy_identity
        or old.posting_policy_acknowledged_at is null then new.posting_policy_acknowledged_at:=clock_timestamp(); end if;
    elsif tg_op='UPDATE' and (new.posting_policy_version,new.posting_policy_identity) is distinct from (old.posting_policy_version,old.posting_policy_identity) then
      raise exception 'Employer must acknowledge posting policy' using errcode='42501';
    end if;
  end if;
  if auth.role()='authenticated' and new.moderation_status in ('pending','approved')
    and (new.posting_policy_version is distinct from 'ca-launch-v1' or new.posting_policy_acknowledged_at is null
      or new.posting_policy_identity is null or new.posting_policy_identity is distinct from public.current_policy_identity()) then
    -- Both owner resubmission and administrator approval require the owner's
    -- current evidence. Pause/close and reads preserve the prior identity/time.
    raise exception 'posting_policy_acknowledgement_required' using errcode='42501';
  end if;
  return new;
end; $$;

-- Retain prior and new explicit acknowledgement evidence in the existing audit
-- store. Controlled service fixtures/imports are never labelled user agreement.
create function public.audit_policy_acknowledgement() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; current_ack jsonb;
begin
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if tg_table_name='profiles' then
    prior:=jsonb_build_object('identity',old.policy_identity,'terms_version',old.terms_version,'terms_accepted_at',old.terms_accepted_at,
      'privacy_notice_version',old.privacy_notice_version,'privacy_notice_acknowledged_at',old.privacy_notice_acknowledged_at);
    current_ack:=jsonb_build_object('identity',new.policy_identity,'terms_version',new.terms_version,'terms_accepted_at',new.terms_accepted_at,
      'privacy_notice_version',new.privacy_notice_version,'privacy_notice_acknowledged_at',new.privacy_notice_acknowledged_at);
  else
    prior:=case when tg_op='UPDATE' then jsonb_build_object('identity',old.posting_policy_identity,'version',old.posting_policy_version,'acknowledged_at',old.posting_policy_acknowledged_at) else null end;
    current_ack:=jsonb_build_object('identity',new.posting_policy_identity,'version',new.posting_policy_version,'acknowledged_at',new.posting_policy_acknowledged_at);
  end if;
  if prior is distinct from current_ack then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
    values(auth.uid(),'policy.acknowledged',case when tg_table_name='profiles' then 'profile' else 'job' end,new.id,
      jsonb_build_object('previous',prior,'current',current_ack),clock_timestamp());
  end if;
  return new;
end; $$;
create trigger profiles_audit_policy after update on public.profiles for each row execute function public.audit_policy_acknowledgement();
create trigger jobs_audit_policy after insert or update on public.jobs for each row execute function public.audit_policy_acknowledgement();
revoke all on function public.audit_policy_acknowledgement() from public,anon,authenticated,service_role;

create or replace function public.privacy_request_access(subject_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'policy_acknowledgements',coalesce((select jsonb_agg(jsonb_build_object('entity_type',entity_type,'entity_id',entity_id,'metadata',metadata,'created_at',created_at)) from public.audit_logs where action='policy.acknowledged' and actor_id=subject_id),'[]'),
 'account',(select jsonb_build_object('id',id,'email',email,'email_confirmed_at',email_confirmed_at,'created_at',created_at) from auth.users where id=subject_id),
 'profile',(select to_jsonb(p) from (select display_name,phone,city,state,role,account_status,email_notifications_enabled,suppressed_email,terms_version,terms_accepted_at,privacy_notice_version,privacy_notice_acknowledged_at,policy_identity,created_at,updated_at from public.profiles where id=subject_id) p),
 'companies',coalesce((select jsonb_agg(to_jsonb(c)) from (select id,name,description,website,phone,city,state,address_display,is_verified,created_at,updated_at from public.companies where owner_id=subject_id) c),'[]'),
 'jobs',coalesce((select jsonb_agg(to_jsonb(j)) from (select id,company_id,title,category,job_type,description,responsibilities,requirements,benefits,city,state,address_display,address_display_mode,pay_min,pay_max,pay_unit,tips_available,schedule_days,schedule_time_range,language_requirement,moderation_status,posted_at,expires_at,created_at,updated_at,posting_policy_version,posting_policy_acknowledged_at,posting_policy_identity from public.jobs where company_id in(select id from public.companies where owner_id=subject_id)) j),'[]'),
 'own_applications',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,job_id,status,cover_note,created_at,updated_at from public.applications where seeker_id=subject_id) a),'[]'),
 'received_application_summary',coalesce((select jsonb_agg(to_jsonb(a)) from (select id,job_id,status,created_at from public.applications where seeker_id<>subject_id and job_id in(select j.id from public.jobs j join public.companies c on c.id=j.company_id where c.owner_id=subject_id)) a),'[]'),
 'own_messages',coalesce((select jsonb_agg(to_jsonb(m)) from (select id,application_id,body,created_at from public.messages where sender_id=subject_id) m),'[]'),
 'own_reports',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,job_id,company_id,reason,details,status,created_at from public.reports where reporter_id=subject_id) r),'[]'),
 'access_requests',coalesce((select jsonb_agg(to_jsonb(r)) from (select id,business_name,contact_name,phone,website,city,state,reason,status,created_at from public.employer_access_requests where requester_id=subject_id) r),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from (select id,kind,status,created_at from public.notification_outbox where recipient_id=subject_id) n),'[]')
); $$;
