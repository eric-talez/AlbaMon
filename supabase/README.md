# Supabase — schema, migrations & seed

This directory is the **source of truth** for the K-Work US database. Everything
the app needs (enums, tables, constraints, triggers, helper functions, Row Level
Security) lives in the migration; sample data lives in the seed.

```
supabase/
  config.toml                         # minimal Supabase CLI config (no secrets)
  migrations/
    20260621000000_init_schema.sql    # full initial schema + RLS
    20260622000000_audit_hardening.sql # role revocation + safe public job view
    20260623000000_application_submission.sql # submitted-only seeker inserts + note limit
    20260624000000_application_listing_functions.sql # caller-bound dashboard RPCs
    20260625000000_employer_write_hardening.sql # verification/boost write guards
    20260626000000_application_messages.sql # participant-bound message threads
    20260627000000_application_status_workflow.sql # owned employer status updates
    20260628000000_report_queue_hardening.sql # report reason/status constraints + RLS
    20260706000000_employer_access_requests.sql # seeker→employer request queue + admin review RPC
    20260707000000_explicit_table_grants.sql # explicit least-privilege API-role grants (RLS stays the row gate)
    20260713000000_restrict_company_public_reads.sql # drop public companies read + revoke anon SELECT (view-only company identity)
    20260714000000_transactional_admin_audit_logs.sql # admin review functions write audit_logs atomically + append-only guard
  seed.sql                            # LA/OC demo companies + jobs
  tests/                              # live psql verification scripts (disposable local stacks only)
```

## Apply locally (Supabase CLI)

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

```bash
supabase start          # boots local Postgres + auth on :54322
supabase db reset       # applies migrations/ then seed.sql from scratch
```

`db reset` is the easiest way to get a clean, fully-seeded database. To apply
new migrations to an already-running DB without wiping data, use `supabase db push`.

For the full app-level walkthrough — wiring the printed keys into `.env.local`,
auth modes, the manual smoke checklist — see
[`docs/LOCAL_SUPABASE.md`](../docs/LOCAL_SUPABASE.md).

## Apply to a hosted Supabase project

1. Sign in: `supabase login`
2. Link the project: `supabase link --project-ref <your-ref>`
3. Push migrations: `supabase db push`
4. (Optional, demo/staging projects only) load demo data by pasting
   `seed.sql` into the **SQL editor** — **never on production**
   ([`docs/LAUNCH_CHECKLIST.md §3`](../docs/LAUNCH_CHECKLIST.md#3-seed--demo-data)).

**Never run `supabase db reset` against a linked hosted project** — it wipes
the database; `db push` is the only schema command for hosted. Or, without
the CLI: open the Supabase **SQL editor**, run every file in `migrations/` in
filename order, then (demo/staging only) `seed.sql`.

After setting the project URL + anon key in `.env.local` (see `.env.example`),
the app automatically switches from mock data to live DB reads — see
[`docs/DATABASE.md`](../docs/DATABASE.md).

Public job pages query the approved-only `public_job_listings` view. The view
includes only the company name and verification flag needed by public listings,
including for an unverified company, without exposing the rest of that company
row. Since Slice 25 (`20260713000000_restrict_company_public_reads.sql`) this
view is the **only** public path to company identity: `anon` and unrelated
seekers can no longer read the `companies` base table directly (the anon SELECT
grant is revoked and the public verified-company policy is dropped), so private
columns like `phone`, `address_display`, `website`, and `owner_id` are not
reachable through PostgREST. Production runtime DB/configuration failures are
surfaced; mock jobs are limited to development, tests, and production builds.

Application dashboards call two authenticated, parameterless RPCs. The seeker
RPC is bound to `auth.uid()`; the employer RPC is limited to caller-owned
companies and returns applicant display name/email only. Both re-check the
runtime database role, use a pinned empty `search_path`, and have default execute
privileges revoked. No service-role client or broader profile-read policy is
used. Without Supabase, application dashboards show an unavailable state and do
not fabricate records.

Employer company and job forms write through the caller-authenticated client.
The Slice 7 migration requires employer-created companies to remain unverified
and employer-created jobs to remain pending and unboosted. Triggers block normal
users from changing verification or boost fields, while allowing admin,
service-role, and trusted unauthenticated migration/database execution.

Slice 8 admin moderation required no additional migration at the time:
cookie-authenticated admins used the existing admin RLS policies and trusted
trigger paths to approve or reject pending jobs and change only company
verification status. Since Slice 27 (`20260714000000`) those decisions run
through admin-only `security definer` functions that also record the decision
in `audit_logs` atomically. Public job reads remain constrained by the
approved-only view; no service-role client is used for these user-facing
actions.

Slice 9 adds `messages` and application-thread access helpers. RLS derives the
caller from `auth.uid()` and permits reads only to the seeker applicant, owning
employer, or admin. Inserts are further limited to seeker/employer participants
sending as themselves. The helper functions pin an empty `search_path`, and
default function/table privileges are revoked before authenticated access is
granted. No service-role client or mock message writes are used.

Slice 10 adds the application status workflow. `applications.status` is
constrained to `submitted`, `reviewing`, `interview`, `offered`, `rejected`, and
`withdrawn`. Owning employers can update status for applications on jobs under
their companies, while seekers still have no update policy and admins retain the
existing admin behavior. A trigger prevents normal authenticated users from
changing applicant, job, cover-note, or timestamp fields through the status path.
Unconfigured environments must show unavailable UI and never mock persistent
status writes. Real email delivery and broader notification preferences remain
deferred.

Slice 11 uses the existing `reports` table for signed-in job reports and admin
review. The hardening migration constrains report reasons/statuses, caps details
at 1,000 characters, prevents duplicate same-user/same-job/same-reason reports,
and replaces report insert RLS so user-facing reports must target approved jobs.
Admins keep existing admin RLS access and can update report status to `reviewed`
or `dismissed`; the migration does not add account sanctions, email alerts, or
bulk investigation workflows.

Slice 12 added Stripe-based payments and boosts without a new migration;
**Slice 23 removed all of it from the MVP** — no Stripe code, env vars,
webhook, or boost UI remains. The `jobs.boost` column and its write
protections stay in the schema, intentionally unused: normal employer writes
still cannot touch the field. There is no payments table, refund schema,
subscription schema, billing portal, or analytics schema.

Slice 21 adds `employer_access_requests`, the self-service path from `seeker`
to `employer`. Real auth users always start as `seeker`; a signed-in seeker
files a request (one open request at a time via a partial unique index), and
only an admin can decide it. The table has insert/select policies but **no
update or delete policy** — approval and rejection go exclusively through the
admin-only `review_employer_access_request()` `security definer` function,
which stamps `reviewed_by`/`reviewed_at` and, on approval, promotes
`profiles.role` to `employer` in the same transaction (and, since Slice 27,
records the decision in `audit_logs` within that transaction too). Rejection
changes no role, users cannot self-promote, and the user-facing flow never
uses the service-role key. Approval does not create a company; company registration and
job submission still follow the existing employer flow, and admin review is
not a business/legal/work-authorization verification.

The `20260707000000` migration adds **explicit table grants** for the
Supabase API roles. Current Supabase projects apply no implicit table
privileges, so without it every real sign-in minted a session and then failed
closed at the `profiles.role` lookup (`permission denied for table profiles`,
42501). The grants are least-privilege and deterministic (revoke-then-grant):
`authenticated` gets the narrow DML surface its policies expect (no DELETEs; no
`profiles` INSERT — provisioning stays with the `on_auth_user_created`
trigger), and `service_role` regains full DML. RLS remains the row-level
authorization gate on every table; `tests/db-schema.test.ts` pins the grant
surface. Details:
[`docs/DATABASE.md`](../docs/DATABASE.md#table-grants-supabase-api-roles).

`20260713000000_restrict_company_public_reads.sql` (Slice 25) then narrows the
public read surface: after it, `anon` may only SELECT `jobs` (rows limited to
`approved` by RLS). The `companies` base table is no longer publicly readable —
its anon SELECT grant is revoked and the `companies_select_public_verified`
policy is dropped — so public company identity is served only through
`public_job_listings`. Employer-owner and admin company reads are unchanged.

`20260714000000_transactional_admin_audit_logs.sql` (Slice 27) makes every
admin moderation decision transactional with its audit trail. Job moderation
(`moderate_pending_job`), company verification (`set_company_verification`),
report review (`review_report`), and the redefined
`review_employer_access_request` are admin-only `security definer` functions
(empty pinned `search_path`, execute granted only to `authenticated`) that
lock the target row, apply the change, and insert exactly one `audit_logs` row
with `actor_id = auth.uid()` — conflicts and failures write nothing. The
migration adds **no** `audit_logs` policies or table grants; a new
`before update or delete` trigger (SECURITY INVOKER, keyed on `current_user`)
backstops the ordinary API roles (`anon`/`authenticated`) against ever gaining
an update/delete path, while trusted maintenance — owner sessions,
`service_role`, restores, and the `actor_id` FK cascade — passes untouched.
Action taxonomy and metadata schema:
[`docs/DATABASE.md`](../docs/DATABASE.md#admin-audit-trail-slice-27). Live
verification: `supabase/tests/slice-27-admin-audit-writes.sql` (run only
against a disposable local stack).

## What the seed contains

- 3 fictional employer accounts (`employer{1,2,3}@example.com`) + profiles
- 3 fictional companies (LA / Orange County)
- 8 **approved** jobs (publicly visible)
- 1 **pending** job + 1 **draft** job — present but never shown publicly, so you
  can verify the approved-only filtering works end to end

All company names are clearly fictional and all wording is compliance-safe (no
Korean-only, visa-status, or under-the-table-cash phrasing).

## Notes & limitations

- Before applying the Slice 5 migration to an existing project, inspect for
  application cover notes longer than 1,000 characters. The migration does not
  truncate data: it adds the check as `NOT VALID`, counts incompatible rows, and
  aborts before validation if any exist. The existing one-application-per-job
  unique constraint is unchanged.

- The seed inserts into `auth.users`; the `on_auth_user_created` trigger
  auto-creates each `profiles` row, which the seed then promotes to `employer`.
- RLS is the authorization gate. The `service_role` key bypasses RLS for trusted
  server-side flows; never expose it to the client.
- Live execution of the application listing functions still requires Supabase
  CLI and Docker; static migration tests cover their role, ownership, field, and
  grant boundaries when that environment is unavailable.
- Live admin RLS and trigger execution likewise requires Supabase CLI and Docker;
  static policy tests cover the moderation boundaries when unavailable.
- Live message-policy execution also requires Supabase CLI and Docker; static
  tests cover participant access, sender pinning, and privilege grants.
- Live application-status RLS execution also requires Supabase CLI and Docker;
  static tests cover the status constraint, ownership policy, seeker blocking,
  and field-change trigger.
- Live report-policy execution also requires Supabase CLI and Docker; static
  tests cover reason/status constraints, approved-job insert RLS, duplicate
  prevention, and admin-only report status updates.
- Live execution of the explicit API-role grants likewise requires Supabase
  CLI and Docker; `tests/db-schema.test.ts` statically pins the per-role
  grant surface (SELECT/INSERT/UPDATE/DELETE per table) when that
  environment is unavailable.
- Runtime authorization reads `profiles.role`, not client-influenced
  `user_metadata.role`. Ownership policies also require the actor's current
  employer/admin role, so demotion revokes private owner access.
