-- C2: current-account admission and rolling quotas share one actor lock.
-- INSERT: actor lock -> fresh status -> fresh counts -> business/FK row locks.
-- UPDATE: row lock -> fresh status, NEVER actor lock (B2 locks jobs first).
-- Already admitted updates may finish while suspension is in flight. Its job
-- UPDATE then pauses those rows before commit; later writes see suspended.
create function public.guard_active_writer()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
begin
  -- Check the actual JWT/API role, not current_user (this function's owner).
  if auth.role()='service_role' or (auth.uid() is null and session_user='postgres'
      and current_setting('role') not in ('anon','authenticated')) then return new; end if;
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':active-writer',0));
  end if;
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then
    raise exception 'account_suspended' using errcode='42501';
  end if;
  if tg_table_name='jobs' then
   if new.moderation_status='approved'
     and not exists(select 1 from public.companies c join public.profiles p on p.id=c.owner_id
       where c.id=new.company_id and p.account_status='active') then
    raise exception 'Owner is inactive' using errcode='42501';
   end if;
  end if;
  if tg_op='UPDATE' and tg_table_name in ('jobs','applications','messages','reports','employer_access_requests')
     and new.created_at is distinct from old.created_at then
    raise exception 'created_at is a trusted field' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.guard_active_writer() from public,anon,authenticated,service_role;

-- No profile INSERT trigger: Auth's trusted bootstrap creates the initial
-- profile before an account can exist. API users have no profile INSERT grant.
create trigger profiles_zz_active_writer before update on public.profiles for each row execute function public.guard_active_writer();
create trigger companies_00_active_writer before insert or update on public.companies for each row execute function public.guard_active_writer();
create trigger jobs_01_active_writer before insert or update on public.jobs for each row execute function public.guard_active_writer();
create trigger applications_00_active_writer before insert or update on public.applications for each row execute function public.guard_active_writer();
create trigger messages_00_active_writer before insert on public.messages for each row execute function public.guard_active_writer();
create trigger reports_00_active_writer before insert or update on public.reports for each row execute function public.guard_active_writer();
create trigger employer_access_00_active_writer before insert or update on public.employer_access_requests for each row execute function public.guard_active_writer();

create function public.enforce_write_limits()
returns trigger language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); cutoff timestamptz; daily bigint; recent bigint;
begin
  if auth.role()='service_role' or (actor is null and session_user='postgres'
      and current_setting('role') not in ('anon','authenticated')) then return new; end if;
  -- The earlier active-writer trigger holds this actor lock through commit.
  -- Every count below is a separate VOLATILE statement after lock acquisition,
  -- so a waiting INSERT sees the preceding transaction's committed rows.
  new.created_at := clock_timestamp();
  cutoff := new.created_at - interval '24 hours';
  case tg_table_name
    when 'jobs' then
      select count(*) into daily from public.jobs j join public.companies c on c.id=j.company_id where c.owner_id=actor and j.created_at>=cutoff;
      if daily>=5 then raise exception 'write_rate_limited' using errcode='P0001'; end if;
    when 'applications' then
      select count(*) into daily from public.applications where seeker_id=actor and created_at>=cutoff;
      if daily>=30 then raise exception 'write_rate_limited' using errcode='P0001'; end if;
    when 'messages' then
      select count(*),count(*) filter(where created_at>=new.created_at-interval '60 seconds') into daily,recent
        from public.messages where sender_id=actor and created_at>=cutoff;
      if daily>=200 or recent>=20 then raise exception 'write_rate_limited' using errcode='P0001'; end if;
    when 'reports' then
      select count(*) into daily from public.reports where reporter_id=actor and created_at>=cutoff;
      if daily>=10 then raise exception 'write_rate_limited' using errcode='P0001'; end if;
    when 'employer_access_requests' then
      select count(*) into daily from public.employer_access_requests where requester_id=actor and created_at>=cutoff;
      if daily>=3 then raise exception 'write_rate_limited' using errcode='P0001'; end if;
  end case;
  return new;
end; $$;
revoke all on function public.enforce_write_limits() from public,anon,authenticated,service_role;
create trigger jobs_02_write_limits before insert on public.jobs for each row execute function public.enforce_write_limits();
create trigger applications_01_write_limits before insert on public.applications for each row execute function public.enforce_write_limits();
create trigger messages_01_write_limits before insert on public.messages for each row execute function public.enforce_write_limits();
create trigger reports_01_write_limits before insert on public.reports for each row execute function public.enforce_write_limits();
create trigger employer_access_01_write_limits before insert on public.employer_access_requests for each row execute function public.enforce_write_limits();
create index jobs_company_created_idx on public.jobs(company_id,created_at desc);
create index applications_seeker_created_idx on public.applications(seeker_id,created_at desc);
create index messages_sender_created_idx on public.messages(sender_id,created_at desc);
create index reports_reporter_created_idx on public.reports(reporter_id,created_at desc);
-- employer_access_requests_requester_created_idx already covers that quota.

-- Invoker boundary: REST cannot bypass the serializing account RPCs, even as
-- AAL2 admin. Trusted RPC writes run as their owner after explicit checks.
create or replace function public.guard_profile_status_change()
returns trigger language plpgsql security invoker set search_path = '' as $$ begin
  if new.account_status is distinct from old.account_status and current_user in ('anon','authenticated') then
    raise exception 'account_status is a trusted field' using errcode='42501';
  end if;
  if new.suppressed_email is distinct from old.suppressed_email
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'suppressed_email is a trusted field' using errcode='42501';
  end if;
  return new;
end; $$;

create function public.suspend_account(target_user_id uuid,reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare prior_reason text;
begin
  if not public.is_admin() or target_user_id=auth.uid() or reason is null or char_length(btrim(reason)) not between 1 and 500 then
    raise exception 'Account change not allowed' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':active-writer',0));
  update public.profiles set account_status='suspended' where id=target_user_id and account_status='active';
  if not found then raise exception 'Account state conflict' using errcode='40001'; end if;
  prior_reason := current_setting('app.job_review_reason',true);
  perform set_config('app.job_review_reason',btrim(reason),true);
  update public.jobs set moderation_status='paused' where company_id in (select id from public.companies where owner_id=target_user_id)
    and moderation_status in ('pending','approved');
  perform set_config('app.job_review_reason',coalesce(prior_reason,''),true);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
    values(auth.uid(),'account.suspended','profile',target_user_id,jsonb_build_object('reason',btrim(reason)),clock_timestamp());
end; $$;
create function public.restore_account(target_user_id uuid,reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare prior_reason text;
begin
  if not public.is_admin() or target_user_id=auth.uid() or reason is null or char_length(btrim(reason)) not between 1 and 500 then
    raise exception 'Account change not allowed' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':active-writer',0));
  perform 1 from public.profiles where id=target_user_id and account_status='suspended' for update;
  if not found then raise exception 'Account state conflict' using errcode='40001'; end if;
  -- Also normalize legacy/controlled-service approved rows before reactivation.
  prior_reason := current_setting('app.job_review_reason',true);
  perform set_config('app.job_review_reason',btrim(reason),true);
  update public.jobs set moderation_status='paused' where company_id in (select id from public.companies where owner_id=target_user_id)
    and moderation_status in ('pending','approved');
  perform set_config('app.job_review_reason',coalesce(prior_reason,''),true);
  update public.profiles set account_status='active' where id=target_user_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
    values(auth.uid(),'account.restored','profile',target_user_id,jsonb_build_object('reason',btrim(reason)),clock_timestamp());
end; $$;
revoke all on function public.suspend_account(uuid,text),public.restore_account(uuid,text) from public,anon;
grant execute on function public.suspend_account(uuid,text),public.restore_account(uuid,text) to authenticated;

-- B2 remains the sole company/job audit writer; only add the missing decisions.
create function public.audit_moderation_decision()
returns trigger language plpgsql security definer set search_path = '' as $$ begin
  if new.status is distinct from old.status then
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata,created_at)
      values(auth.uid(),case when tg_table_name='reports' then 'report.' else 'employer_access.' end || new.status,
        case when tg_table_name='reports' then 'report' else 'employer_access_request' end,new.id,
        jsonb_build_object('previous',old.status,'current',new.status),clock_timestamp());
  end if;
  return new;
end; $$;
revoke all on function public.audit_moderation_decision() from public,anon,authenticated,service_role;
create trigger reports_audit_decision after update of status on public.reports for each row execute function public.audit_moderation_decision();
create trigger employer_access_audit_decision after update of status on public.employer_access_requests for each row execute function public.audit_moderation_decision();

-- Equality-filtered queues then stable oldest-first 20-row pages.
create index jobs_moderation_created_id_idx on public.jobs(moderation_status,created_at,id);
create index companies_verified_created_id_idx on public.companies(is_verified,created_at,id);
create index reports_status_created_id_idx on public.reports(status,created_at,id);
create index employer_access_status_created_id_idx on public.employer_access_requests(status,created_at,id);
create index profiles_status_created_id_idx on public.profiles(account_status,created_at,id);
