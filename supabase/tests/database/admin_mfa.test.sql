-- Disposable seeded local database only; all fixtures and changes roll back.
begin;
\ir helpers/policy-fixtures.inc
create extension if not exists pgtap with schema extensions;
select plan(45);
insert into auth.users (id, email, email_confirmed_at) values
  ('77777777-7777-4777-8777-777777777777', 'mfa-admin@example.invalid', now()),
  ('88888888-8888-4888-8888-888888888888', 'confirmed-auth@example.invalid', now()),
  ('99999999-9999-4999-8999-999999999999', 'unconfirmed-auth@example.invalid', null);
update public.profiles set role = 'admin' where id = '77777777-7777-4777-8777-777777777777';
update public.profiles set display_name = 'Same name', email = 'spoofed-profile@example.invalid'
  where id in ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999');
insert into public.applications (id, job_id, seeker_id) values
  ('cccccccc-1111-4111-8111-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '88888888-8888-4888-8888-888888888888'),
  ('cccccccc-1111-4111-8111-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', '99999999-9999-4999-8999-999999999999');
insert into public.messages (application_id, sender_id, body) values ('cccccccc-1111-4111-8111-000000000001', '88888888-8888-4888-8888-888888888888', 'Private applicant thread');
insert into public.employer_access_requests (id, requester_id, business_name, contact_name, city)
  values ('eeeeeeee-1111-4111-8111-000000000001', '88888888-8888-4888-8888-888888888888', 'Test business', 'Test contact', 'Los Angeles');
select is((select count(*) from public.applications where id = 'cccccccc-1111-4111-8111-000000000001'), 1::bigint, 'private application target exists');
select is((select count(*) from public.messages where application_id = 'cccccccc-1111-4111-8111-000000000001'), 1::bigint, 'private message target exists');
select is((select count(*) from public.jobs where id = 'bbbbbbbb-0000-0000-0000-000000000001'), 1::bigint, 'moderation job target exists');
select is((select count(*) from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1::bigint, 'verification company target exists');
select is((select count(*) from public.employer_access_requests where id = 'eeeeeeee-1111-4111-8111-000000000001'), 1::bigint, 'review request target exists');

reset role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.acknowledge_test_actor();
update public.profiles set account_status = 'active' where id = '77777777-7777-4777-8777-777777777777';
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","aal":"aal1"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.is_admin(), false, 'active admin aal1 privilege gate');
select is(public.can_access_application_thread('cccccccc-1111-4111-8111-000000000001'), false, 'active admin aal1 thread helper');
select is((select count(*) from public.get_application_thread_context('cccccccc-1111-4111-8111-000000000001')), 0::bigint, 'active admin aal1 context RPC');
select is((select count(*) from public.messages where application_id = 'cccccccc-1111-4111-8111-000000000001'), 0::bigint, 'active admin aal1 message RLS');
select is((select count(*) from public.profiles where id = '88888888-8888-4888-8888-888888888888'), 0::bigint, 'active admin aal1 profile RLS');
with changed as (update public.jobs set moderation_status = 'approved' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'active admin aal1 moderation update');
with changed as (update public.companies set is_verified = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'active admin aal1 verification update');
with changed as (update public.profiles set account_status = 'suspended' where id = '99999999-9999-4999-8999-999999999999' returning id)
select is((select count(*) from changed), 0::bigint, 'active admin aal1 suspend another profile');
select throws_ok($$select public.review_employer_access_request('eeeeeeee-1111-4111-8111-000000000001', 'approved')$$, 'P0001', null, 'active admin aal1 cannot bypass RPC gate');
select throws_ok($$update public.profiles set account_status = 'suspended' where id = '77777777-7777-4777-8777-777777777777'$$, '42501', 'account_status is a trusted field', 'active admin aal1 cannot change own status');

reset role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.acknowledge_test_actor();
update public.profiles set account_status = 'suspended' where id = '77777777-7777-4777-8777-777777777777';
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","aal":"aal2"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.is_admin(), false, 'suspended admin aal2 privilege gate');
select is(public.can_access_application_thread('cccccccc-1111-4111-8111-000000000001'), false, 'suspended admin aal2 thread helper');
select is((select count(*) from public.get_application_thread_context('cccccccc-1111-4111-8111-000000000001')), 0::bigint, 'suspended admin aal2 context RPC');
select is((select count(*) from public.messages where application_id = 'cccccccc-1111-4111-8111-000000000001'), 0::bigint, 'suspended admin aal2 message RLS');
select is((select count(*) from public.profiles where id = '88888888-8888-4888-8888-888888888888'), 0::bigint, 'suspended admin aal2 profile RLS');
with changed as (update public.jobs set moderation_status = 'approved' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'suspended admin aal2 moderation update');
with changed as (update public.companies set is_verified = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'suspended admin aal2 verification update');
with changed as (update public.profiles set account_status = 'suspended' where id = '99999999-9999-4999-8999-999999999999' returning id)
select is((select count(*) from changed), 0::bigint, 'suspended admin aal2 suspend another profile');
select throws_ok($$select public.review_employer_access_request('eeeeeeee-1111-4111-8111-000000000001', 'approved')$$, 'P0001', null, 'suspended admin aal2 cannot bypass RPC gate');
select throws_ok($$update public.profiles set account_status = 'active' where id = '77777777-7777-4777-8777-777777777777'$$, '42501', 'account_status is a trusted field', 'suspended admin aal2 cannot change own status');

reset role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.acknowledge_test_actor();
update public.profiles set account_status = 'active' where id = '77777777-7777-4777-8777-777777777777';
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","aal":"aal2"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.is_admin(), true, 'active admin aal2 privilege gate');
select is(public.can_access_application_thread('cccccccc-1111-4111-8111-000000000001'), true, 'active admin aal2 thread helper');
select is((select count(*) from public.get_application_thread_context('cccccccc-1111-4111-8111-000000000001')), 1::bigint, 'active admin aal2 context RPC');
select is((select count(*) from public.messages where application_id = 'cccccccc-1111-4111-8111-000000000001'), 1::bigint, 'active admin aal2 message RLS');
select is((select count(*) from public.profiles where id = '88888888-8888-4888-8888-888888888888'), 1::bigint, 'active admin aal2 profile RLS');
with changed as (update public.jobs set moderation_status = 'approved' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 1::bigint, 'active admin aal2 moderation update');
with changed as (update public.companies set is_verified = true where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id)
select is((select count(*) from changed), 1::bigint, 'active admin aal2 verification update');
select lives_ok($$select public.suspend_account('99999999-9999-4999-8999-999999999999','AAL2 moderation test')$$, 'active admin aal2 suspend another profile through atomic RPC');
select is(public.review_employer_access_request('eeeeeeee-1111-4111-8111-000000000001', 'rejected'), 'rejected', 'active admin aal2 review RPC');

reset role;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated","aal":"aal1"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select throws_ok($$update public.profiles set account_status = 'suspended' where id = '88888888-8888-4888-8888-888888888888'$$, '42501', 'account_status is a trusted field', 'seeker cannot change own trusted status');
select lives_ok($$update public.profiles set display_name = 'Same name', city = 'Los Angeles' where id = '88888888-8888-4888-8888-888888888888'$$, 'seeker can update own display fields');
select is(public.can_access_application_thread('cccccccc-1111-4111-8111-000000000001'), true, 'seeker participant access preserved');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.can_access_application_thread('cccccccc-1111-4111-8111-000000000001'), true, 'employer participant access preserved');
select is((select applicant_email from public.list_employer_applications() where application_id = 'cccccccc-1111-4111-8111-000000000001'), 'confirmed-auth@example.invalid', 'applicant contact comes from confirmed Auth email, never profile email');
select is((select applicant_email from public.list_employer_applications() where application_id = 'cccccccc-1111-4111-8111-000000000002'), null::text, 'unconfirmed Auth email is not disclosed');
select is((select count(*) from public.list_employer_applications() where applicant_display_name = 'Same name'), 2::bigint, 'same display names remain separate applicants');
reset role;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.acknowledge_test_actor();
update auth.users set email = 'updated-auth@example.invalid' where id = '88888888-8888-4888-8888-888888888888';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is((select applicant_email from public.list_employer_applications() where application_id = 'cccccccc-1111-4111-8111-000000000001'), 'updated-auth@example.invalid', 'contact follows current confirmed Auth email');
reset role;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.is_admin(), false, 'missing aal defaults to aal1');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","aal":"aal2"}', true);
select pg_temp.acknowledge_test_actor();
set local role authenticated;
select is(public.is_admin(), false, 'missing subject cannot become admin');
reset role;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"service_role","aal":"aal1"}', true);
select pg_temp.acknowledge_test_actor();
set local role service_role;
select lives_ok($$update public.profiles set account_status = 'active' where id = '99999999-9999-4999-8999-999999999999'$$, 'trusted service-role operations can change status');
select * from finish();
rollback;
