begin;
\ir ../helpers/policy-fixtures.inc
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Dedicated future reference isolates this rolled-back fixture from seed dates.
insert into auth.users(id,email) select ('c4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'c4-'||n||'@example.invalid' from generate_series(1,8) n;
update public.profiles set role='admin' where id='c4000000-0000-4000-8000-000000000008';
update public.profiles set account_status='suspended' where id='c4000000-0000-4000-8000-000000000007';
insert into public.jobs(id,company_id,title,category,job_type,city,state,pay_min,pay_max,pay_unit,schedule_days,schedule_time_range,language_requirement,description,moderation_status,posted_at,expires_at)
select ('c4110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aaaaaaaa-0000-0000-0000-000000000001','C4 cohort '||n,'other','part_time','Oakland','CA',20,25,'hour','Mon','9-5','english_required','Actual description','approved',
case n when 1 then '2040-01-04'::timestamptz when 2 then '2040-01-25'::timestamptz when 3 then '2040-01-15'::timestamptz when 4 then '2040-01-26'::timestamptz when 6 then '2040-01-15'::timestamptz else null end,'2040-03-01' from generate_series(1,6) n;
-- Simulate a legacy non-CA row only inside this rolled-back fixture.
alter table public.jobs disable trigger jobs_enforce_ca_pay;
update public.jobs set state='NY' where id='c4110000-0000-4000-8000-000000000006';
alter table public.jobs enable trigger jobs_enforce_ca_pay;
insert into public.applications(id,job_id,seeker_id,created_at,status) values
('c4220000-0000-4000-8000-000000000001','c4110000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','2040-01-04','submitted'),
('c4220000-0000-4000-8000-000000000002','c4110000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002','2040-01-11','offered'),
('c4220000-0000-4000-8000-000000000003','c4110000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000003','2040-01-26','submitted'),
('c4220000-0000-4000-8000-000000000004','c4110000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000004','2040-01-14','submitted'),
('c4220000-0000-4000-8000-000000000005','c4110000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000005','2040-01-23','submitted'),
('c4220000-0000-4000-8000-000000000006','c4110000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000006','2040-01-16','withdrawn'),
('c4220000-0000-4000-8000-000000000007','c4110000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000007','2040-01-16','submitted');
insert into public.messages(application_id,sender_id,body,created_at) values
('c4220000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001','Seeker','2040-01-04 00:30Z'),
('c4220000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000008','Admin','2040-01-04 01:00Z'),
('c4220000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','Other employer','2040-01-04 01:30Z'),
('c4220000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','Before application','2040-01-03 23:00Z'),
('c4220000-0000-4000-8000-000000000001','11111111-1111-1111-1111-111111111111','First real reply','2040-01-04 02:00Z'),
('c4220000-0000-4000-8000-000000000002','11111111-1111-1111-1111-111111111111','First real reply','2040-01-11 06:00Z'),
('c4220000-0000-4000-8000-000000000003','11111111-1111-1111-1111-111111111111','After reference','2040-02-02');
-- Closed/expired mature publications must remain in the denominator.
update public.jobs set moderation_status='expired',expires_at='2040-01-12' where id='c4110000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select * from public.admin_marketplace_signals('2040-02-01')$$,'42501',null,'anon denied');
reset role;
select set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select * from public.admin_marketplace_signals('2040-02-01')$$,'42501',null,'AAL1 admin denied');
select set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal2"}',true);
select results_eq($$select cohort_count,applied_within_7_days,median_first_employer_reply_hours,unanswered_application_count from public.admin_marketplace_signals('2040-02-01')$$,
$$values(3::bigint,2::bigint,4::double precision,1::bigint)$$,'mature window boundaries, history, withdrawn/spam exclusion and actual owner replies');
select results_eq($$select cohort_count,applied_within_7_days,median_first_employer_reply_hours,unanswered_application_count from public.admin_marketplace_signals('2050-02-01')$$,
$$values(0::bigint,0::bigint,null::double precision,0::bigint)$$,'empty cohort and null reply median');
reset role;
select set_config('request.jwt.claims','{}',true);
-- Aggregate covers more than PostgREST default row limit.
insert into public.jobs(id,company_id,title,category,job_type,city,pay_min,pay_max,pay_unit,schedule_days,schedule_time_range,language_requirement,description,moderation_status,posted_at,expires_at)
select gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','C4 range '||n,'other','part_time','Oakland',20,25,'hour','Mon','9-5','english_required','Description','expired','2041-01-15','2041-01-20' from generate_series(1,1001) n;
select set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select is((select cohort_count from public.admin_marketplace_signals('2041-02-01')),1001::bigint,'aggregate is not truncated at 1000');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set account_status='suspended' where id='c4000000-0000-4000-8000-000000000008';
select set_config('request.jwt.claims','{"sub":"c4000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select throws_ok($$select * from public.admin_marketplace_signals('2040-02-01')$$,'42501',null,'suspended admin denied');
select * from finish();
rollback;
