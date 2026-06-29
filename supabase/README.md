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
  seed.sql                            # LA/OC demo companies + jobs
```

## Apply locally (Supabase CLI)

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

```bash
supabase start          # boots local Postgres + auth on :54322
supabase db reset       # applies migrations/ then seed.sql from scratch
```

`db reset` is the easiest way to get a clean, fully-seeded database. To apply
new migrations to an already-running DB without wiping data, use `supabase db push`.

## Apply to a hosted Supabase project

1. Link the project: `supabase link --project-ref <your-ref>`
2. Push migrations: `supabase db push`
3. (Optional) load demo data by pasting `seed.sql` into the **SQL editor**.

Or, without the CLI: open the Supabase **SQL editor**, run every file in
`migrations/` in filename order, then run `seed.sql`.

After setting the project URL + anon key in `.env.local` (see `.env.example`),
the app automatically switches from mock data to live DB reads — see
[`docs/DATABASE.md`](../docs/DATABASE.md).

Public job pages query the approved-only `public_job_listings` view. The view
includes only the company name and verification flag needed by public listings,
including for an unverified company, without exposing the rest of that company
row. Production runtime DB/configuration failures are surfaced; mock jobs are
limited to development, tests, and production builds.

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

Slice 8 admin moderation requires no additional migration. Cookie-authenticated
admins use the existing admin RLS policies and trusted trigger paths to approve
or reject pending jobs and change only company verification status. Public job
reads remain constrained by the approved-only view; no service-role client is
used for these user-facing actions.

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
- Runtime authorization reads `profiles.role`, not client-influenced
  `user_metadata.role`. Ownership policies also require the actor's current
  employer/admin role, so demotion revokes private owner access.
