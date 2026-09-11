-- Read-only inventory. Identified rows belong in protected operator evidence.
-- Before lifecycle migrations, run the CA/pay/city section first; run expiry
-- inventory after its columns exist. Never treat defaults as verified approval.
begin read only;
select count(*) as applied_migrations from supabase_migrations.schema_migrations;
select 'auth.users' as relation, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'companies', count(*) from public.companies
union all select 'jobs', count(*) from public.jobs
union all select 'applications', count(*) from public.applications
union all select 'messages', count(*) from public.messages
union all select 'reports', count(*) from public.reports
union all select 'employer_access_requests', count(*) from public.employer_access_requests
union all select 'notification_outbox', count(*) from public.notification_outbox
union all select 'email_webhook_receipts', count(*) from public.email_webhook_receipts
union all select 'audit_logs', count(*) from public.audit_logs;
select state, pay_unit, count(*) from public.jobs group by state, pay_unit order by state, pay_unit;
select count(*) filter (where state <> 'CA') as non_ca,
       count(*) filter (where pay_min <= 0) as nonpositive_pay,
       count(*) filter (where moderation_status = 'approved' and (state <> 'CA' or pay_min <= 0)) as approved_incompatible
from public.jobs;
select id, company_id, moderation_status, city, state, pay_min, pay_unit
from public.jobs
where state <> 'CA' or pay_min <= 0
order by moderation_status, id;
select city, count(*) from public.jobs group by city order by city;
select count(*) filter (where moderation_status='approved' and expires_at is null) as approved_without_expiry,
       count(*) filter (where moderation_status in ('pending','draft') and posted_at is not null) as ambiguous_unreviewed_publication
from public.jobs;
select id, company_id, moderation_status, posted_at, expires_at, created_at
from public.jobs
where (moderation_status='approved' and expires_at is null)
   or (moderation_status in ('pending','draft') and posted_at is not null)
order by created_at, id;
select count(*) as publicly_open from public.public_job_listings;
-- RPC takes FOR SHARE; inside this read-only operator inventory use a plain read.
select identity as current_policy_identity from public.policy_publication where singleton;
select count(*) as acknowledged_profiles from public.profiles where policy_identity is not null;
select count(*) as acknowledged_jobs from public.jobs where posting_policy_identity is not null;
rollback;
