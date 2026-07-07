-- ============================================================================
-- K-Work US — explicit table privileges for the Supabase API roles
-- ============================================================================
-- Why: the Slice 3 schema relied on Supabase's legacy default privileges,
-- which implicitly granted broad table access to `anon`, `authenticated`, and
-- `service_role`. Current Supabase projects (and current CLI local stacks) no
-- longer do that: tables created by migrations receive NO select/insert/
-- update/delete for the API roles. The result was that every real sign-in
-- (social or phone OTP) minted a valid session but then failed closed at the
-- `profiles.role` lookup — "permission denied for table profiles" (42501) —
-- so users bounced back to /login on every provider.
--
-- Model unchanged: Row Level Security remains the row gate on every table.
-- These are least-privilege TABLE-level grants matching the existing policies
-- (see the per-table notes). `public.messages` and `public.public_job_listings`
-- already carry their own explicit grants in earlier migrations and are not
-- touched here. The leading revokes make the result deterministic on projects
-- created back when Supabase still applied the legacy implicit grants.

-- profiles: own/admin select + constrained update (self role change is pinned
-- by policy and by the prevent_profile_role_self_update trigger). Rows are
-- provisioned only by the security-definer on_auth_user_created trigger, so
-- the API roles get no insert.
revoke all on table public.profiles from public, anon, authenticated;
grant select, update on table public.profiles to authenticated;

-- jobs: public may read (RLS exposes approved rows only); employers insert
-- (forced to 'pending' by policy) and update their own; admins moderate.
revoke all on table public.jobs from public, anon, authenticated;
grant select on table public.jobs to anon;
grant select, insert, update on table public.jobs to authenticated;

-- companies: public may read (RLS exposes verified rows only); employers
-- insert/update their own (verification pinned by trigger); admins manage.
revoke all on table public.companies from public, anon, authenticated;
grant select on table public.companies to anon;
grant select, insert, update on table public.companies to authenticated;

-- applications: seekers insert/read their own; employers read/update status
-- for their jobs; admins read/update. Never anonymous.
revoke all on table public.applications from public, anon, authenticated;
grant select, insert, update on table public.applications to authenticated;

-- reports: any signed-in user files one; reporters read their own; admins
-- read/update the queue. Never anonymous.
revoke all on table public.reports from public, anon, authenticated;
grant select, insert, update on table public.reports to authenticated;

-- employer_access_requests: requesters insert/read their own; admins read.
-- Review/approval mutates through the security-definer
-- review_employer_access_request() function, so no update grant.
revoke all on table public.employer_access_requests from public, anon, authenticated;
grant select, insert on table public.employer_access_requests to authenticated;

-- audit_logs: admin-only reads via RLS; rows are written by trusted
-- server-side flows (service role / security-definer functions) only.
revoke all on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

-- service_role: trusted server-side key (RLS bypass by design). Restore the
-- standard Supabase DML surface it lost with the defaults change.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.jobs to service_role;
grant select, insert, update, delete on table public.companies to service_role;
grant select, insert, update, delete on table public.applications to service_role;
grant select, insert, update, delete on table public.reports to service_role;
grant select, insert, update, delete on table public.employer_access_requests to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;
grant select, insert, update, delete on table public.messages to service_role;
