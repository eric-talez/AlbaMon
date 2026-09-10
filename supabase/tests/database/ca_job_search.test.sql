-- Disposable seeded Supabase only. Every fixture and mutation rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
insert into auth.users (id, email)
values ('66666666-6666-4666-8666-666666666666', 'ca-search-admin@example.invalid');
update public.profiles set role = 'admin'
where id = '66666666-6666-4666-8666-666666666666';

-- Simulate unknown hosted legacy data that predates the new write guard.
alter table public.jobs disable trigger jobs_enforce_ca_pay;
insert into public.jobs (
  id, company_id, title, category, job_type, city, state, address_display,
  address_display_mode, pay_min, pay_max, pay_unit, tips_available,
  schedule_days, schedule_time_range, language_requirement, description,
  moderation_status, posted_at
) values
  ('d0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Legacy Nevada listing', 'other', 'part_time', 'Las Vegas', 'NV', 'Las Vegas, NV',
   'city_only', 20, 25, 'hour', false, '주 1일', '09:00-17:00',
   'english_required', 'Legacy state fixture', 'approved', '2026-09-09T01:00:00Z'),
  ('d0000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Legacy zero-pay listing', 'other', 'part_time', 'Fresno', 'CA', 'Fresno, CA',
   'city_only', 0, 0, 'hour', true, '주 1일', '09:00-17:00',
   'english_required', 'Legacy pay fixture', 'pending', '2026-09-09T01:00:00Z');
alter table public.jobs enable trigger jobs_enforce_ca_pay;

insert into public.jobs (
  id, company_id, title, category, job_type, city, state, address_display,
  address_display_mode, pay_min, pay_max, pay_unit, tips_available,
  schedule_days, schedule_time_range, language_requirement, description,
  moderation_status, posted_at
) values
  ('d0000000-0000-4000-8000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',
   'B1 pay literal * comma, open( close)', 'other', 'part_time', 'San Jose', 'CA', 'San Jose, CA',
   'city_only', 18, 25, 'hour', false, '월-금', '09:00-17:00',
   'korean_helpful', 'Contains literal percent % and underscore _ markers.', 'approved', '2026-09-09T08:00:00Z'),
  ('d0000000-0000-4000-8000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001',
   'B1 pay threshold', 'other', 'part_time', 'Sacramento', 'CA', 'Sacramento, CA',
   'city_only', 22, 25, 'hour', false, '월-금', '09:00-17:00',
   'korean_helpful', 'Threshold fixture', 'approved', '2026-09-09T09:00:00Z'),
  ('d0000000-0000-4000-8000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001',
   'B1 pay salary', 'other', 'full_time', 'San Diego', 'CA', 'San Diego, CA',
   'city_only', 60000, 60000, 'year', false, '월-금', '09:00-17:00',
   'english_required', 'Annual fixture', 'approved', '2026-09-09T10:00:00Z');

select is((select count(*) from public.public_job_listings where id = 'd0000000-0000-4000-8000-000000000001'), 0::bigint, 'public view excludes legacy non-CA jobs');
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select is((select count(*) from public.jobs where id = 'd0000000-0000-4000-8000-000000000001'), 0::bigint, 'anonymous base-table policy excludes legacy non-CA jobs');
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is((select count(*) from public.jobs where id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint, 'owner still sees own legacy non-CA job');
reset role;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is((select count(*) from public.jobs where id = 'd0000000-0000-4000-8000-000000000001'), 1::bigint, 'admin still sees legacy non-CA job');
reset role;
select set_config('request.jwt.claims', '{}', true);
select is((select array_agg(city order by city) from public.list_public_job_cities() where city in ('Las Vegas','Sacramento','San Diego','San Jose')), array['Sacramento','San Diego','San Jose']::text[], 'city RPC lists distinct public CA cities only');
select is((select array_agg(id order by id) from public.search_public_jobs(search_query => 'B1 pay', search_pay_unit => 'hour', search_pay_min => 20)), array['d0000000-0000-4000-8000-000000000012'::uuid], 'minimum pay compares pay_min within one unit');
select is((select count(*) from public.search_public_jobs(search_query => '*')), 2::bigint, 'asterisk search is literal');
select is((select count(*) from public.search_public_jobs(search_query => ',')), 2::bigint, 'comma search is literal');
select is((select count(*) from public.search_public_jobs(search_query => 'open(')), 2::bigint, 'opening parenthesis search is literal');
select is((select count(*) from public.search_public_jobs(search_query => 'close)')), 2::bigint, 'closing parenthesis search is literal');
select is((select count(*) from public.search_public_jobs(search_query => '%')), 2::bigint, 'percent search is literal');
select is((select count(*) from public.search_public_jobs(search_query => '_')), 2::bigint, 'underscore search is literal');

select throws_ok($$insert into public.jobs (company_id,title,category,job_type,city,state,address_display_mode,pay_min,pay_max,pay_unit,tips_available,schedule_days,schedule_time_range,language_requirement,description,moderation_status) values ('aaaaaaaa-0000-0000-0000-000000000001','Outside CA','other','part_time','Reno','NV','city_only',20,20,'hour',false,'주 1일','09:00-17:00','english_required','Invalid state','pending')$$, '23514', '현재는 캘리포니아 근무지 공고만 등록할 수 있습니다.', 'insert rejects non-CA workplace');
select throws_ok($$insert into public.jobs (company_id,title,category,job_type,city,state,address_display_mode,pay_min,pay_max,pay_unit,tips_available,schedule_days,schedule_time_range,language_requirement,description,moderation_status) values ('aaaaaaaa-0000-0000-0000-000000000001','Zero pay','other','part_time','Fresno','CA','city_only',0,0,'hour',true,'주 1일','09:00-17:00','english_required','Invalid pay','pending')$$, '23514', '0보다 큰 기본 급여를 입력해 주세요. 팁은 별도입니다.', 'insert rejects zero base pay despite tips');
select throws_ok($$update public.jobs set moderation_status = 'approved' where id = 'd0000000-0000-4000-8000-000000000002'$$, '23514', '0보다 큰 기본 급여를 입력해 주세요. 팁은 별도입니다.', 'publication update rechecks legacy invalid pay');
select lives_ok($$update public.jobs set moderation_status = 'paused' where id = 'd0000000-0000-4000-8000-000000000002'$$, 'legacy invalid row can be safely paused');
select throws_ok($$update public.jobs set state = 'NV' where id = 'd0000000-0000-4000-8000-000000000011'$$, '23514', '현재는 캘리포니아 근무지 공고만 등록할 수 있습니다.', 'state update cannot move a job outside CA');
select throws_ok($$update public.jobs set pay_min = 0 where id = 'd0000000-0000-4000-8000-000000000011'$$, '23514', '0보다 큰 기본 급여를 입력해 주세요. 팁은 별도입니다.', 'pay update cannot set zero base pay');

insert into public.jobs (company_id,title,category,job_type,city,state,address_display_mode,pay_min,pay_max,pay_unit,tips_available,schedule_days,schedule_time_range,language_requirement,description,moderation_status,posted_at)
select 'aaaaaaaa-0000-0000-0000-000000000001','B1 page fixture ' || n,'other','part_time','Oakland','CA','city_only',20,20,'hour',false,'월-금','09:00-17:00','english_required','Pagination fixture','approved','2026-09-08T12:00:00Z' from generate_series(1,21) n;
select is((select count(*) from public.search_public_jobs(search_query => 'B1 page fixture', search_page => 1)), 21::bigint, 'first page returns twenty rows plus the next-page sentinel');
select is((select count(*) from public.search_public_jobs(search_query => 'B1 page fixture', search_page => 2)), 1::bigint, 'second page starts at row twenty-one');

select * from finish();
rollback;
