-- C1: business writes and their relation-derived notifications commit together.
alter table public.profiles
  add column email_notifications_enabled boolean not null default true,
  add column suppressed_email boolean not null default false;

-- Invoker context distinguishes trusted function writes from direct REST writes.
create or replace function public.guard_profile_status_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'account_status is a trusted field' using errcode='42501';
  end if;
  if new.suppressed_email is distinct from old.suppressed_email
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'suppressed_email is a trusted field' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger profiles_guard_email_suppression before update of suppressed_email on public.profiles
for each row execute function public.guard_profile_status_change();

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check (kind in ('application_submitted','application_status_changed','message_digest','job_reviewed','employer_access_requested','employer_access_reviewed','job_pending','report_opened')),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  entity_id uuid not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','suppressed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text unique,
  payload_hash text,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index notification_outbox_pending_idx on public.notification_outbox(available_at)
where status in ('pending','sending');
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated;
grant select,insert,update,delete on public.notification_outbox to service_role;

create table public.email_webhook_receipts (
  event_id text primary key,
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  kind text not null check(kind in ('email.bounced','email.complained')),
  created_at timestamptz not null default now()
);
alter table public.email_webhook_receipts enable row level security;
revoke all on public.email_webhook_receipts from public, anon, authenticated;
grant select,insert,delete on public.email_webhook_receipts to service_role;

create function public.enqueue_notification(p_kind text,p_recipient_id uuid,p_entity_id uuid,p_event_key text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notification_outbox(kind,recipient_id,entity_id,event_key)
  values(p_kind,p_recipient_id,p_entity_id,p_event_key) on conflict(event_key) do nothing;
$$;
revoke all on function public.enqueue_notification(text,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.enqueue_business_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  event_kind text;
  entity uuid := new.id;
  event_time timestamptz := clock_timestamp();
  key_suffix text;
begin
  if tg_table_name='applications' then
    if tg_op='INSERT' then
      event_kind := 'application_submitted';
      select c.owner_id into recipient from public.jobs j join public.companies c on c.id=j.company_id where j.id=new.job_id;
      event_time := new.created_at;
    elsif new.status is distinct from old.status then
      event_kind := 'application_status_changed'; recipient := new.seeker_id; event_time := new.updated_at;
    end if;
  elsif tg_table_name='messages' then
    event_kind := 'message_digest'; entity := new.application_id;
    select case when new.sender_id=a.seeker_id then c.owner_id when new.sender_id=c.owner_id then a.seeker_id end
      into recipient from public.applications a join public.jobs j on j.id=a.job_id
      join public.companies c on c.id=j.company_id where a.id=new.application_id;
    -- Use DB time, never a caller-selected message timestamp, for the fixed bucket.
    key_suffix := floor(extract(epoch from statement_timestamp())/600)::text;
  elsif tg_table_name='jobs' then
    if tg_op='INSERT' or new.moderation_status is distinct from old.moderation_status then
      event_time := new.updated_at;
      if new.moderation_status='pending' then event_kind := 'job_pending';
      elsif new.moderation_status in ('approved','rejected') and tg_op='UPDATE' then
        event_kind := 'job_reviewed';
        select c.owner_id into recipient from public.companies c where c.id=new.company_id;
      end if;
    end if;
  elsif tg_table_name='employer_access_requests' then
    if tg_op='INSERT' then event_kind := 'employer_access_requested'; event_time := new.created_at;
    elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
      event_kind := 'employer_access_reviewed'; recipient := new.requester_id; event_time := new.reviewed_at;
    end if;
  elsif tg_table_name='reports' then
    if new.status='open' and (tg_op='INSERT' or new.status is distinct from old.status) then
      event_kind := 'report_opened'; event_time := new.updated_at;
    end if;
  end if;
  if event_kind is null then return new; end if;
  key_suffix := coalesce(key_suffix,extract(epoch from event_time)::text);
  if event_kind in ('employer_access_requested','job_pending','report_opened') then
    for recipient in select p.id from public.profiles p where p.role='admin' and p.account_status='active' loop
      perform public.enqueue_notification(event_kind,recipient,entity,entity||':'||event_kind||':'||recipient||':'||key_suffix);
    end loop;
  elsif recipient is not null then
    perform public.enqueue_notification(event_kind,recipient,entity,entity||':'||event_kind||':'||recipient||':'||key_suffix);
  end if;
  return new;
end; $$;
revoke all on function public.enqueue_business_notifications() from public,anon,authenticated,service_role;
create trigger applications_enqueue_notifications after insert or update of status on public.applications for each row execute function public.enqueue_business_notifications();
create trigger messages_enqueue_notifications after insert on public.messages for each row execute function public.enqueue_business_notifications();
create trigger jobs_enqueue_notifications after insert or update of moderation_status on public.jobs for each row execute function public.enqueue_business_notifications();
create trigger employer_access_enqueue_notifications after insert or update of status on public.employer_access_requests for each row execute function public.enqueue_business_notifications();
create trigger reports_enqueue_notifications after insert or update of status on public.reports for each row execute function public.enqueue_business_notifications();

create function public.claim_notification_batch(batch_size integer)
returns setof public.notification_outbox language plpgsql security definer set search_path = '' as $$
begin
  -- Exhausted/old uncertain sends never cross Resend's 24h guarantee (23h margin).
  update public.notification_outbox set status='failed',lease_until=null,
    last_error_code=case when attempts>=5 then 'attempts_exhausted' else 'idempotency_window_expired' end
  where ((status='sending' and lease_until<=now()) or (status='pending' and available_at<=now()))
    and (attempts>=5 or first_attempt_at < now()-interval '23 hours');
  return query
  with due as (
    select o.id from public.notification_outbox o
    where ((o.status='pending' and o.available_at<=now()) or (o.status='sending' and o.lease_until<=now()))
      and o.attempts<5 and (o.first_attempt_at is null or o.first_attempt_at>=now()-interval '23 hours')
    order by o.available_at,o.id for update skip locked limit greatest(0,least(coalesce(batch_size,5),5))
  )
  update public.notification_outbox o set status='sending',lease_until=now()+interval '5 minutes',
    attempts=o.attempts+1,first_attempt_at=coalesce(o.first_attempt_at,now())
  from due where o.id=due.id returning o.*;
end; $$;

create function public.get_notification_delivery_context(p_id uuid,p_attempts integer)
returns table(account_status text,email_notifications_enabled boolean,suppressed_email boolean,path text)
language sql stable security definer set search_path = '' as $$
 select p.account_status,p.email_notifications_enabled,p.suppressed_email,
  case o.kind
    when 'application_submitted' then '/employer/applications'
    when 'application_status_changed' then '/dashboard/applications'
    when 'job_reviewed' then '/employer/jobs'
    when 'employer_access_requested' then '/admin/employer-requests'
    when 'employer_access_reviewed' then '/employer/request-access'
    when 'job_pending' then '/admin/jobs'
    when 'report_opened' then '/admin/reports'
    when 'message_digest' then (
      select case when a.seeker_id=o.recipient_id then '/dashboard/applications/'||a.id||'/messages'
        when c.owner_id=o.recipient_id then '/employer/applications/'||a.id||'/messages' end
      from public.applications a join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id where a.id=o.entity_id)
  end
 from public.notification_outbox o join public.profiles p on p.id=o.recipient_id
 where o.id=p_id and o.attempts=p_attempts and o.status='sending' and o.lease_until>now();
$$;

-- Only a fingerprint is retained. A changed Auth email/from/origin/template cannot
-- reuse an uncertain send's key with a different payload; fail closed for review.
create function public.bind_notification_payload(p_id uuid,p_attempts integer,p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.notification_outbox set payload_hash=p_hash where id=p_id and attempts=p_attempts
    and status='sending' and lease_until>now() and (payload_hash is null or payload_hash=p_hash);
  return found;
end; $$;

create function public.finish_notification_attempt(p_id uuid,p_attempts integer,p_status text,p_error_code text default null,p_provider_id text default null,p_retry_after_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('pending','sent','failed','suppressed') then raise exception 'Invalid completion'; end if;
  update public.notification_outbox set
    status=case when p_status='pending' and attempts>=5 then 'failed' else p_status end,
    available_at=case when p_status='pending' then now()+make_interval(secs=>greatest(coalesce(p_retry_after_seconds,0),
      case attempts when 1 then 60 when 2 then 300 when 3 then 900 else 3600 end)) else available_at end,
    last_error_code=p_error_code,provider_id=coalesce(p_provider_id,provider_id),
    sent_at=case when p_status='sent' then now() else sent_at end,lease_until=null
  where id=p_id and attempts=p_attempts and status='sending' and lease_until>now();
  return found;
end; $$;

create function public.record_email_webhook(p_event_id text,p_kind text,p_provider_id text,p_outbox_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.notification_outbox%rowtype;
begin
  if p_kind not in ('email.bounced','email.complained') or nullif(p_event_id,'') is null or nullif(p_provider_id,'') is null then
    raise exception 'Invalid webhook';
  end if;
  if exists(select 1 from public.email_webhook_receipts where event_id=p_event_id) then return true; end if;
  select * into target from public.notification_outbox o where o.provider_id=p_provider_id
    or (o.id=p_outbox_id and o.provider_id is null and o.attempts>0 and o.payload_hash is not null)
    order by (o.provider_id=p_provider_id) desc nulls last limit 1 for update;
  if not found then return false; end if;
  insert into public.email_webhook_receipts(event_id,outbox_id,kind) values(p_event_id,target.id,p_kind)
    on conflict(event_id) do nothing;
  if not found then return true; end if;
  update public.profiles set suppressed_email=true where id=target.recipient_id;
  update public.notification_outbox set provider_id=p_provider_id,status='suppressed',lease_until=null,
    last_error_code=case when p_kind='email.bounced' then 'email_bounced' else 'email_complained' end where id=target.id;
  return true;
end; $$;

create function public.get_notification_queue_health()
returns table(pending bigint,oldest_available_at timestamptz,failed bigint,overdue boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admin AAL2 required' using errcode='42501'; end if;
  return query select count(*) filter(where o.status in ('pending','sending')),
    min(o.available_at) filter(where o.status in ('pending','sending')),
    count(*) filter(where o.status='failed'),
    coalesce(min(o.available_at) filter(where o.status in ('pending','sending'))<now()-interval '10 minutes',false)
  from public.notification_outbox o;
end; $$;
revoke all on function public.claim_notification_batch(integer),public.get_notification_delivery_context(uuid,integer),public.bind_notification_payload(uuid,integer,text),public.finish_notification_attempt(uuid,integer,text,text,text,integer),public.record_email_webhook(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer),public.get_notification_delivery_context(uuid,integer),public.bind_notification_payload(uuid,integer,text),public.finish_notification_attempt(uuid,integer,text,text,text,integer),public.record_email_webhook(text,text,text,uuid) to service_role;
revoke all on function public.get_notification_queue_health() from public,anon,authenticated;
grant execute on function public.get_notification_queue_health() to authenticated;
