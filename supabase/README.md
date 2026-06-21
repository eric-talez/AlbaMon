# Supabase — schema, migrations & seed

This directory is the **source of truth** for the K-Work US database. Everything
the app needs (enums, tables, constraints, triggers, helper functions, Row Level
Security) lives in the migration; sample data lives in the seed.

```
supabase/
  config.toml                         # minimal Supabase CLI config (no secrets)
  migrations/
    20260621000000_init_schema.sql    # full initial schema + RLS
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

Or, without the CLI: open the Supabase **SQL editor**, paste the contents of
`migrations/20260621000000_init_schema.sql`, run it, then paste `seed.sql`.

After setting the project URL + anon key in `.env.local` (see `.env.example`),
the app automatically switches from mock data to live DB reads — see
[`docs/DATABASE.md`](../docs/DATABASE.md).

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
- In Slice 3 the runtime auth role is still read from Supabase `user_metadata`
  (not `profiles`). Switching `getCurrentUser()` to `profiles` is a next-slice task.
