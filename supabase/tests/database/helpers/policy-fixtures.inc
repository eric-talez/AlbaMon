-- Existing security scenarios assume prior acknowledgement. Use the same self
-- RPC as the product for each active test actor; C3 tests exercise missing/old states.
create function pg_temp.acknowledge_test_actor() returns void language plpgsql as $$ begin
  if auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then
    perform public.acknowledge_policies('ca-launch-v1',true,'ca-launch-v1',true,public.current_policy_identity());
  end if;
end; $$;
-- Legacy job fixtures represent previously acknowledged submissions, solely in
-- this rolled-back test transaction. The production columns have no defaults.
alter table public.jobs alter column posting_policy_identity set default public.current_policy_identity();
alter table public.jobs alter column posting_policy_version set default 'ca-launch-v1';
update public.jobs set posting_policy_identity=public.current_policy_identity(),posting_policy_version='ca-launch-v1',posting_policy_acknowledged_at=now();
