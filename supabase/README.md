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

## What the seed contains

- 3 fictional employer accounts (`employer{1,2,3}@example.com`) + profiles
- 3 fictional companies (LA / Orange County)
- 8 **approved** jobs (publicly visible)
- 1 **pending** job + 1 **draft** job — present but never shown publicly, so you
  can verify the approved-only filtering works end to end

All company names are clearly fictional and all wording is compliance-safe (no
Korean-only, visa-status, or under-the-table-cash phrasing).

## Notes & limitations

- The seed inserts into `auth.users`; the `on_auth_user_created` trigger
  auto-creates each `profiles` row, which the seed then promotes to `employer`.
- RLS is the authorization gate. The `service_role` key bypasses RLS for trusted
  server-side flows; never expose it to the client.
- Runtime authorization reads `profiles.role`, not client-influenced
  `user_metadata.role`. Ownership policies also require the actor's current
  employer/admin role, so demotion revokes private owner access.
