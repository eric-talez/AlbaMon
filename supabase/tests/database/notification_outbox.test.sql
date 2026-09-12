begin;
\ir helpers/policy-fixtures.inc
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('public','notification_outbox','transactional outbox exists');
select has_function('public','claim_notification_batch',array['integer'],'service claim exists');
select has_function('public','record_email_webhook',array['text','text','text','uuid'],'durable webhook transaction exists');

insert into auth.users(id,email,email_confirmed_at) values
 ('c1000000-0000-4000-8000-000000000001','c1-seeker@example.invalid',now()),
 ('c1000000-0000-4000-8000-000000000002','c1-admin1@example.invalid',now()),
 ('c1000000-0000-4000-8000-000000000003','c1-admin2@example.invalid',now()),
 ('c1000000-0000-4000-8000-000000000004','c1-inactive@example.invalid',now());
update public.profiles set role='admin' where id in ('c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000004');
update public.profiles set account_status='suspended' where id='c1000000-0000-4000-8000-000000000004';
select is((select email_notifications_enabled from public.profiles where id='c1000000-0000-4000-8000-000000000001'),true,'notification preference defaults enabled');
select is((select suppressed_email from public.profiles where id='c1000000-0000-4000-8000-000000000001'),false,'suppression defaults false');

savepoint original_write;
insert into public.applications(id,job_id,seeker_id,cover_note) values('c1100000-0000-4000-8000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','c1000000-0000-4000-8000-000000000001','private application contact');
rollback to original_write;
select is((select count(*) from public.notification_outbox where entity_id='c1100000-0000-4000-8000-000000000001'),0::bigint,'original transaction rollback removes event');
insert into public.applications(id,job_id,seeker_id,cover_note) values('c1100000-0000-4000-8000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','c1000000-0000-4000-8000-000000000001','private application contact');
select is((select count(*) from public.notification_outbox where entity_id='c1100000-0000-4000-8000-000000000001'),1::bigint,'original write creates event within transaction');
select is((select recipient_id from public.notification_outbox where entity_id='c1100000-0000-4000-8000-000000000001'),'11111111-1111-1111-1111-111111111111'::uuid,'application recipient derives from job company owner');
select public.enqueue_notification(kind,recipient_id,entity_id,event_key) from public.notification_outbox where entity_id='c1100000-0000-4000-8000-000000000001';
select is((select count(*) from public.notification_outbox where entity_id='c1100000-0000-4000-8000-000000000001'),1::bigint,'same event key replay deduplicates');
update public.applications set status='reviewing' where id='c1100000-0000-4000-8000-000000000001';
select is((select recipient_id from public.notification_outbox where kind='application_status_changed' and entity_id='c1100000-0000-4000-8000-000000000001'),'c1000000-0000-4000-8000-000000000001'::uuid,'status change targets applicant');
update public.applications set status='reviewing' where id='c1100000-0000-4000-8000-000000000001';
select is((select count(*) from public.notification_outbox where kind='application_status_changed' and entity_id='c1100000-0000-4000-8000-000000000001'),1::bigint,'unchanged status emits nothing');
update public.applications set status='interview' where id='c1100000-0000-4000-8000-000000000001';
select is((select count(*) from public.notification_outbox where kind='application_status_changed' and entity_id='c1100000-0000-4000-8000-000000000001'),2::bigint,'final raw monotonic revision distinguishes successive statuses');
update public.profiles set role='employer' where id='c1000000-0000-4000-8000-000000000001';
insert into public.messages(application_id,sender_id,body) values
 ('c1100000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','private message1'),
 ('c1100000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','private message2'),
 ('c1100000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','reply');
select is((select count(*) from public.notification_outbox where kind='message_digest' and entity_id='c1100000-0000-4000-8000-000000000001'),2::bigint,'10 minute digest groups by actual opposite participant after promotion');
select ok(not exists(select 1 from public.notification_outbox where row_to_json(notification_outbox)::text like '%private%'),'outbox stores no message/application/contact text');
insert into public.reports(id,reporter_id,job_id,reason) values('c1200000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','spam');
select is((select count(*) from public.notification_outbox where entity_id='c1200000-0000-4000-8000-000000000001'),2::bigint,'queue fans out to distinct active admins only');
select public.enqueue_notification(kind,recipient_id,entity_id,event_key) from public.notification_outbox where entity_id='c1200000-0000-4000-8000-000000000001';
select is((select count(*) from public.notification_outbox where entity_id='c1200000-0000-4000-8000-000000000001'),2::bigint,'fanout replay deduplicates separately per recipient');
insert into public.employer_access_requests(id,requester_id,business_name,contact_name,city) values('c1300000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','C1','Contact','LA');
select is((select count(*) from public.notification_outbox where entity_id='c1300000-0000-4000-8000-000000000001'),2::bigint,'access request notifies both active admins');
update public.employer_access_requests set status='rejected',reviewed_at=now() where id='c1300000-0000-4000-8000-000000000001';
select is((select recipient_id from public.notification_outbox where kind='employer_access_reviewed' and entity_id='c1300000-0000-4000-8000-000000000001'),'c1000000-0000-4000-8000-000000000001'::uuid,'review result targets requester');
update public.jobs set moderation_status='pending' where id='bbbbbbbb-0000-0000-0000-000000000001';
select is((select count(*) from public.notification_outbox where kind='job_pending' and entity_id='bbbbbbbb-0000-0000-0000-000000000001'),2::bigint,'job pending fans out');
update public.jobs set moderation_status='approved' where id='bbbbbbbb-0000-0000-0000-000000000001';
select is((select recipient_id from public.notification_outbox where kind='job_reviewed' and entity_id='bbbbbbbb-0000-0000-0000-000000000001'),'11111111-1111-1111-1111-111111111111'::uuid,'job review targets company owner');

select ok(not has_table_privilege('authenticated','public.notification_outbox','SELECT'),'authenticated cannot read raw queue');
select ok(not has_table_privilege('anon','public.notification_outbox','INSERT'),'anonymous cannot enqueue');
select ok(not has_function_privilege('authenticated','public.enqueue_notification(text,uuid,uuid,text)','EXECUTE'),'caller cannot choose recipients via enqueue RPC');
select ok(not has_function_privilege('service_role','public.enqueue_notification(text,uuid,uuid,text)','EXECUTE'),'enqueue is trigger-internal only');
select ok(not has_function_privilege('authenticated','public.claim_notification_batch(integer)','EXECUTE'),'claim is not user flow');
select ok(not has_function_privilege('anon','public.record_email_webhook(text,text,text,uuid)','EXECUTE'),'webhook DB write is service only');
select ok(not has_table_privilege('authenticated','public.email_webhook_receipts','SELECT'),'webhook receipts private');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select lives_ok($$update public.profiles set email_notifications_enabled=false where id='c1000000-0000-4000-8000-000000000001'$$,'own notification opt out allowed');
select throws_ok($$update public.profiles set suppressed_email=true where id='c1000000-0000-4000-8000-000000000001'$$,'42501','suppressed_email is a trusted field','user cannot forge trusted suppression');
select throws_ok($$select * from public.get_notification_queue_health()$$,'42501','Admin AAL2 required','seeker cannot query aggregate');
reset role;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select throws_ok($$select * from public.get_notification_queue_health()$$,'42501','Admin AAL2 required','admin AAL1 cannot query aggregate');
reset role;
select set_config('request.jwt.claims','{}',true);
select pg_temp.acknowledge_test_actor();

-- Exercise claims without touching preexisting rows: all other rows are deferred
-- only inside this rollback transaction.
update public.notification_outbox set available_at=now()+interval '1 day';
insert into public.notification_outbox(id,event_key,kind,recipient_id,entity_id)
select ('c1400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'c1-claim-'||n,'message_digest','c1000000-0000-4000-8000-000000000001','c1100000-0000-4000-8000-000000000001' from generate_series(1,6) n;
create temporary table first_claim as select * from public.claim_notification_batch(99);
select is((select count(*) from first_claim),5::bigint,'claim clamps to five');
select ok((select bool_and(status='sending' and attempts=1 and lease_until=now()+interval '5 minutes' and first_attempt_at=now()) from first_claim),'claim records lease and first attempt atomically');
create temporary table second_claim as select * from public.claim_notification_batch(5);
select is((select count(*) from second_claim),1::bigint,'subsequent worker cannot reclaim leased five');
select is((select path from public.get_notification_delivery_context('c1400000-0000-4000-8000-000000000001',1)),'/dashboard/applications/c1100000-0000-4000-8000-000000000001/messages','promoted recipient uses actual applicant messages route');
select is(public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',0,'sent'),false,'old attempt cannot finish claim');
select is(public.bind_notification_payload('c1400000-0000-4000-8000-000000000001',1,repeat('a',64)),true,'first payload bound');
select is(public.bind_notification_payload('c1400000-0000-4000-8000-000000000001',1,repeat('b',64)),false,'different retry payload rejected');
select is(public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',1,'pending','provider_429'),true,'retry completes current claim');
select is((select available_at from public.notification_outbox where id='c1400000-0000-4000-8000-000000000001'),now()+interval '1 minute','first retry after one minute');
update public.notification_outbox set available_at=now() where id='c1400000-0000-4000-8000-000000000001';
select is((select attempts from public.claim_notification_batch(1)),2,'retry advances attempt');
select is(public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',1,'sent'),false,'stale completion cannot overwrite new attempt');
select public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',2,'pending','provider_500');
select is((select available_at from public.notification_outbox where id='c1400000-0000-4000-8000-000000000001'),now()+interval '5 minutes','second retry after five minutes');
update public.notification_outbox set available_at=now() where id='c1400000-0000-4000-8000-000000000001';
select count(*) from public.claim_notification_batch(1);
select public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',3,'pending','provider_500');
select is((select available_at from public.notification_outbox where id='c1400000-0000-4000-8000-000000000001'),now()+interval '15 minutes','third retry after fifteen minutes');
update public.notification_outbox set available_at=now() where id='c1400000-0000-4000-8000-000000000001';
select count(*) from public.claim_notification_batch(1);
select public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',4,'pending','provider_429',null,7200);
select is((select available_at from public.notification_outbox where id='c1400000-0000-4000-8000-000000000001'),now()+interval '2 hours','larger provider retry-after honored');
update public.notification_outbox set available_at=now() where id='c1400000-0000-4000-8000-000000000001';
select count(*) from public.claim_notification_batch(1);
select public.finish_notification_attempt('c1400000-0000-4000-8000-000000000001',5,'pending','provider_500');
select is((select status from public.notification_outbox where id='c1400000-0000-4000-8000-000000000001'),'failed','fifth failure is terminal');
update public.notification_outbox set lease_until=now()-interval '1 second' where id='c1400000-0000-4000-8000-000000000002';
select is((select attempts from public.claim_notification_batch(1)),2,'worker interruption lease recovers');
update public.notification_outbox set attempts=5,lease_until=now()-interval '1 second' where id='c1400000-0000-4000-8000-000000000002';
select count(*) from public.claim_notification_batch(1);
select is((select status from public.notification_outbox where id='c1400000-0000-4000-8000-000000000002'),'failed','unknown fifth success not sent a sixth time');
update public.notification_outbox set first_attempt_at=now()-interval '23 hours 1 second',lease_until=now()-interval '1 second' where id='c1400000-0000-4000-8000-000000000003';
select count(*) from public.claim_notification_batch(1);
select is((select last_error_code from public.notification_outbox where id='c1400000-0000-4000-8000-000000000003'),'idempotency_window_expired','23 hour unknown-success cutoff');
select public.bind_notification_payload('c1400000-0000-4000-8000-000000000004',1,repeat('a',64));
-- Force a late write failure: receipt and profile must roll back with the row.
create function pg_temp.reject_webhook_write() returns trigger language plpgsql as $$ begin raise exception 'fixture write failure'; end; $$;
create trigger c1_fixture_reject before update on public.notification_outbox for each row execute function pg_temp.reject_webhook_write();
select throws_ok($$select public.record_email_webhook('c1-failed-transaction','email.bounced','c1-provider','c1400000-0000-4000-8000-000000000004')$$,'P0001','fixture write failure','webhook fails if final outbox write fails');
select is((select count(*) from public.email_webhook_receipts where event_id='c1-failed-transaction'),0::bigint,'failed webhook does not consume signed event');
select is((select suppressed_email from public.profiles where id='c1000000-0000-4000-8000-000000000001'),false,'failed webhook rolls back profile suppression');
drop trigger c1_fixture_reject on public.notification_outbox;
select is(public.record_email_webhook('c1-webhook-early','email.bounced','c1-provider','c1400000-0000-4000-8000-000000000004'),true,'early webhook tag correlates before provider ID completion');
select is((select suppressed_email from public.profiles where id='c1000000-0000-4000-8000-000000000001'),true,'bounce suppresses relation recipient');
select is((select provider_id from public.notification_outbox where id='c1400000-0000-4000-8000-000000000004'),'c1-provider','early webhook durably stores provider ID');
select is(public.finish_notification_attempt('c1400000-0000-4000-8000-000000000004',1,'sent',null,'c1-provider'),false,'worker completion cannot undo bounce');
select is(public.record_email_webhook('c1-webhook-early','email.bounced','c1-provider',null),true,'duplicate webhook is successful no op');
select is((select count(*) from public.email_webhook_receipts where event_id='c1-webhook-early'),1::bigint,'webhook dedup durable');
select is(public.record_email_webhook('c1-webhook-complaint','email.complained','c1-provider',null),true,'later complaint correlates by provider ID');
select is(public.record_email_webhook('c1-webhook-conflict','email.bounced','different-provider','c1400000-0000-4000-8000-000000000004'),false,'conflicting provider cannot correlate by tag');
select is(public.record_email_webhook('c1-webhook-missing','email.bounced','unknown',null),false,'uncorrelated event stays retryable');
select is((select count(*) from public.email_webhook_receipts where event_id='c1-webhook-missing'),0::bigint,'unmatched event never consumed');
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is((select failed from public.get_notification_queue_health()),3::bigint,'active AAL2 admin sees terminal failures');
select throws_ok($$update public.profiles set suppressed_email=false where id='c1000000-0000-4000-8000-000000000001'$$,'42501','suppressed_email is a trusted field','even admin REST cannot undo webhook suppression');
reset role;
select set_config('request.jwt.claims','{}',true);
select pg_temp.acknowledge_test_actor();
update public.profiles set account_status='suspended' where id='c1000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select throws_ok($$select * from public.get_notification_queue_health()$$,'42501','Admin AAL2 required','suspended AAL2 admin denied aggregate');
reset role;
-- Maintenance is bounded independently of the requested delivery batch.
insert into public.notification_outbox(event_key,kind,recipient_id,entity_id,status,attempts,available_at)
select 'c1-recovery-bound-'||n,'application_submitted','c1000000-0000-4000-8000-000000000001',
  'c1100000-0000-4000-8000-000000000001','pending',5,now() from generate_series(1,6) n;
select count(*) from public.claim_notification_batch(0);
select is((select count(*) from public.notification_outbox where event_key like 'c1-recovery-bound-%' and status='failed'),5::bigint,'terminal maintenance processes at most five rows');
select is((select count(*) from public.notification_outbox where event_key like 'c1-recovery-bound-%' and status='pending'),1::bigint,'excess terminal candidate remains for next sweep');
select count(*) from public.claim_notification_batch(0);
select is((select count(*) from public.notification_outbox where event_key like 'c1-recovery-bound-%' and status='failed'),6::bigint,'later sweep completes remaining terminal work');
select * from finish();
rollback;
