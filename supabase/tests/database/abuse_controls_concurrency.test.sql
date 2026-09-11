-- Genuine committed fixtures and two backend transactions. No sleeps establish
-- correctness: each release requires an observed ungranted pg_locks row.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select no_plan();
create function pg_temp.c2_races() returns setof text language plpgsql as $test$
declare
  owner_id text := 'c2110000-0000-4000-8000-000000000001';
  seeker_id text := 'c2110000-0000-4000-8000-000000000002';
  admin_id text := 'c2110000-0000-4000-8000-000000000003';
  company_id text := 'c2110000-0000-4000-8000-000000000004';
  job_id text := 'c2110000-0000-4000-8000-000000000005';
  application_id text := 'c2110000-0000-4000-8000-000000000006';
  insert_job text;
  insert_message text;
  actor_a text; actor_b text; query_a text; query_b text; observed text;
  pid_b integer; waited boolean; deadline timestamptz; scenario integer;
  cleanup text := $clean$
    delete from public.notification_outbox where entity_id in (
      select id from public.jobs where company_id='c2110000-0000-4000-8000-000000000004'
      union select id from public.applications where id='c2110000-0000-4000-8000-000000000006');
    delete from public.audit_logs where entity_id in (
      select id from public.jobs where company_id='c2110000-0000-4000-8000-000000000004'
      union select id from public.profiles where id in ('c2110000-0000-4000-8000-000000000001','c2110000-0000-4000-8000-000000000002','c2110000-0000-4000-8000-000000000003'));
    delete from auth.users where id in ('c2110000-0000-4000-8000-000000000001','c2110000-0000-4000-8000-000000000002','c2110000-0000-4000-8000-000000000003');
  $clean$;
begin
  perform extensions.dblink_connect('c2_setup','host=supabase_db_albalmon-ca-launch user=postgres password=postgres dbname='||current_database());
  perform extensions.dblink_exec('c2_setup',cleanup);
  perform extensions.dblink_exec('c2_setup',$setup$
    insert into auth.users(id,email) values
      ('c2110000-0000-4000-8000-000000000001','c2-race-owner@example.invalid'),
      ('c2110000-0000-4000-8000-000000000002','c2-race-seeker@example.invalid'),
      ('c2110000-0000-4000-8000-000000000003','c2-race-admin@example.invalid');
    update public.profiles set policy_identity=public.current_policy_identity(),terms_version='ca-launch-v1',terms_accepted_at=now(),privacy_notice_version='ca-launch-v1',privacy_notice_acknowledged_at=now() where id in ('c2110000-0000-4000-8000-000000000001','c2110000-0000-4000-8000-000000000002','c2110000-0000-4000-8000-000000000003');
    update public.profiles set role='employer' where id='c2110000-0000-4000-8000-000000000001';
    update public.profiles set role='admin' where id='c2110000-0000-4000-8000-000000000003';
    insert into public.companies(id,owner_id,name,city) values('c2110000-0000-4000-8000-000000000004','c2110000-0000-4000-8000-000000000001','C2 race','Oakland');
    insert into public.jobs(id,company_id,title,category,job_type,city,pay_min,pay_max,pay_unit,schedule_days,schedule_time_range,language_requirement,description,moderation_status,expires_at)
      values('c2110000-0000-4000-8000-000000000005','c2110000-0000-4000-8000-000000000004','Race','other','part_time','Oakland',20,25,'hour','Mon','9-5','english_required','Fixture','approved',now()+interval '30 days');
    update public.jobs set posting_policy_identity=public.current_policy_identity(),posting_policy_version='ca-launch-v1',posting_policy_acknowledged_at=now() where id='c2110000-0000-4000-8000-000000000005';
    insert into public.applications(id,job_id,seeker_id) values('c2110000-0000-4000-8000-000000000006','c2110000-0000-4000-8000-000000000005','c2110000-0000-4000-8000-000000000002');
    insert into public.messages(application_id,sender_id,body) select 'c2110000-0000-4000-8000-000000000006','c2110000-0000-4000-8000-000000000002','Initial' from generate_series(1,19);
  $setup$);
  insert_message := format('insert into public.messages(application_id,sender_id,body) values(%L,%L,''Racer'')',application_id,seeker_id);
  insert_job := format('insert into public.jobs(company_id,title,category,job_type,city,pay_min,pay_max,pay_unit,schedule_days,schedule_time_range,language_requirement,description,posting_policy_version,posting_policy_identity) values(%L,''Inserted racer'',''other'',''part_time'',''Oakland'',20,25,''hour'',''Mon'',''9-5'',''english_required'',''Fixture'',''ca-launch-v1'',public.current_policy_identity())',company_id);
  for scenario in 1..7 loop
    if scenario>1 then
      perform extensions.dblink_exec('c2_setup',format('update public.profiles set account_status=''active'' where id=%L; update public.jobs set moderation_status=''approved'' where id=%L',owner_id,job_id));
    end if;
    actor_a := case when scenario=1 then seeker_id when scenario in (3,5,7) then admin_id else owner_id end;
    actor_b := case when scenario=1 then seeker_id when scenario in (3,5,7) then owner_id else admin_id end;
    query_a := case
      when scenario=1 then insert_message
      when scenario=2 then insert_job
      when scenario in (3,5,7) then format('select public.suspend_account(%L,''Race suspension'')',owner_id)
      when scenario=4 then format('update public.jobs set title=''Earlier edit'',moderation_status=''pending'' where id=%L',job_id)
      when scenario=6 then format('select * from public.transition_job(%L,''pause'',(select updated_at from public.jobs where id=%L))',job_id,job_id) end;
    query_b := case when scenario=1 then insert_message when scenario=3 then insert_job
      when scenario in (2,4,6) then format('select public.suspend_account(%L,''Race suspension'')',owner_id)
      when scenario=5 then format('update public.jobs set title=''Later edit'',moderation_status=''pending'' where id=%L',job_id)
      when scenario=7 then format('select status from public.transition_job(%L,''resubmit'',(select updated_at from public.jobs where id=%L))',job_id,job_id) end;
    perform extensions.dblink_connect('c2_a','host=supabase_db_albalmon-ca-launch user=postgres password=postgres dbname='||current_database());
    perform extensions.dblink_connect('c2_b','host=supabase_db_albalmon-ca-launch user=postgres password=postgres dbname='||current_database());
    -- Temp invoker test helper exposes the actual SQLSTATE, never bypasses RLS.
    perform extensions.dblink_exec('c2_a',$helper$create function pg_temp.run(q text) returns text language plpgsql as $$ begin execute q; return 'ok'; exception when others then return sqlstate||':'||sqlerrm; end $$; set statement_timeout='8s'; set lock_timeout='6s';$helper$);
    perform extensions.dblink_exec('c2_b',$helper$create function pg_temp.run(q text) returns text language plpgsql as $$ declare result text; begin if q like 'select status%' then execute q into result; return result; end if; execute q; return 'ok'; exception when others then return sqlstate||':'||sqlerrm; end $$; set statement_timeout='8s'; set lock_timeout='6s';$helper$);
    perform extensions.dblink_exec('c2_a',format('set role authenticated; set request.jwt.claims=%L; begin',json_build_object('sub',actor_a,'role','authenticated','aal','aal2')::text));
    perform extensions.dblink_exec('c2_b',format('set role authenticated; set request.jwt.claims=%L',json_build_object('sub',actor_b,'role','authenticated','aal','aal2')::text));
    select pid into pid_b from extensions.dblink('c2_b','select pg_backend_pid()') as t(pid integer);
    select result into observed from extensions.dblink('c2_a',format('select pg_temp.run(%L)',query_a)) as t(result text);
    return next extensions.is(observed,'ok','scenario '||scenario||': first authenticated operation admitted');
    perform extensions.dblink_send_query('c2_b',format('select pg_temp.run(%L)',query_b));
    deadline := clock_timestamp()+interval '3 seconds'; waited := false;
    while clock_timestamp()<deadline loop
      select exists(select 1 from pg_locks where pid=pid_b and not granted) into waited;
      exit when waited;
      perform pg_sleep(0.01);
    end loop;
    return next extensions.ok(waited,'scenario '||scenario||': second backend visibly waits on lock');
    perform extensions.dblink_exec('c2_a','commit');
    select result into observed from extensions.dblink_get_result('c2_b') as t(result text);
    return next extensions.is(observed,case when scenario=1 then 'P0001:write_rate_limited' when scenario=3 then '42501:account_suspended' when scenario=5 then '42501:Job write not allowed' when scenario=7 then 'not_allowed' else 'ok' end,'scenario '||scenario||': waiter sees committed status/count without deadlock');
    if scenario=1 then
      select result into observed from extensions.dblink('c2_setup',format('select count(*)::text from public.messages where sender_id=%L',seeker_id)) as t(result text);
      return next extensions.is(observed,'20','exactly 20 messages committed across both backends');
    else
      select result into observed from extensions.dblink('c2_setup',format('select count(*)::text from public.jobs where company_id=%L and moderation_status in (''pending'',''approved'')',company_id)) as t(result text);
      return next extensions.is(observed,'0','scenario '||scenario||': no job escapes suspension');
    end if;
    perform extensions.dblink_disconnect('c2_a'); perform extensions.dblink_disconnect('c2_b');
  end loop;
  perform extensions.dblink_exec('c2_setup',cleanup);
  select result into observed from extensions.dblink('c2_setup',format('select count(*)::text from auth.users where id in (%L,%L,%L)',owner_id,seeker_id,admin_id)) as t(result text);
  return next extensions.is(observed,'0','committed race fixtures removed');
  perform extensions.dblink_disconnect('c2_setup');
exception when others then
  -- Disconnect first: releases locks and rolls back unfinished transactions.
  if 'c2_a'=any(extensions.dblink_get_connections()) then perform extensions.dblink_disconnect('c2_a'); end if;
  if 'c2_b'=any(extensions.dblink_get_connections()) then perform extensions.dblink_disconnect('c2_b'); end if;
  if 'c2_setup'=any(extensions.dblink_get_connections()) then
    perform extensions.dblink_exec('c2_setup',cleanup); perform extensions.dblink_disconnect('c2_setup');
  end if;
  raise;
end;
$test$;
select * from pg_temp.c2_races();
select * from finish();
rollback;
