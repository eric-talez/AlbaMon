# Deployment — Vercel + Supabase

How to deploy K-Work US for the private beta. The app is a standard Next.js 16
App Router project: **Vercel** hosts the app and **hosted Supabase** provides
Auth + Postgres (with RLS). Nothing in this guide contains real credentials —
every value shown is a placeholder.

Companion docs:

- [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) — go/no-go checklist for the beta.
- [`../supabase/README.md`](../supabase/README.md) — schema, migrations & seed details.
- [`DATABASE.md`](DATABASE.md) — schema and access-layer reference.

## 1. Prerequisites

- Node.js 20+ and npm 10+ (`npm install`, `npm run build` must pass locally).
- A [Supabase](https://supabase.com) account + [Supabase CLI](https://supabase.com/docs/guides/cli).
- A [Vercel](https://vercel.com) account with access to this Git repository.

## 2. Supabase (hosted project)

1. Create a new Supabase project (region close to LA/OC users, e.g. `us-west-1`).
2. Link and push migrations from the repo root:

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   `db push` applies everything in `supabase/migrations/` **in filename order**:

   | Order | Migration | What it sets up |
   |---|---|---|
   | 1 | `20260621000000_init_schema.sql` | Enums, all tables, triggers, helper functions, RLS |
   | 2 | `20260622000000_audit_hardening.sql` | Role-revocation safety + approved-only `public_job_listings` view |
   | 3 | `20260623000000_application_submission.sql` | Seeker insert policy + cover-note limit |
   | 4 | `20260624000000_application_listing_functions.sql` | Caller-bound dashboard RPCs |
   | 5 | `20260625000000_employer_write_hardening.sql` | Verification/boost write guards (retained schema hardening; boost is unused since Slice 23) |
   | 6 | `20260626000000_application_messages.sql` | Participant-bound message threads |
   | 7 | `20260627000000_application_status_workflow.sql` | Application status constraint + policies |
   | 8 | `20260628000000_report_queue_hardening.sql` | Report reason/status constraints + RLS |
   | 9 | `20260706000000_employer_access_requests.sql` | Seeker→employer request queue + admin review RPC |
   | 10 | `20260707000000_explicit_table_grants.sql` | Explicit least-privilege table grants for the API roles — **required**: without it real sign-ins mint a session but fail closed at the `profiles.role` lookup (42501) and bounce to `/login` ([`DATABASE.md`](DATABASE.md#table-grants-supabase-api-roles)) |
   | 11 | `20260713000000_restrict_company_public_reads.sql` | Drops the public verified-company read policy and revokes the `anon` SELECT on `companies`, so company identity is public only via `public_job_listings` (Slice 25) |

   Without the CLI: run each file in the Supabase **SQL editor**, in the same
   order.

3. **Do not run `supabase/seed.sql` against production.** It creates fictional
   demo employers, companies, and jobs with well-known UUIDs and a shared
   password — it exists for local dev and demos only. See the
   [launch checklist](LAUNCH_CHECKLIST.md#3-seed--demo-data) for how to verify
   none of it is present. Likewise, **never run `supabase db reset` against a
   hosted/production project** — it drops and recreates the database.
   `supabase db push` is the only schema command this guide uses against
   hosted; `db reset` belongs to the disposable local stack
   ([`LOCAL_SUPABASE.md §14`](LOCAL_SUPABASE.md#14-resetting-the-local-db-safely)).

4. Configure Auth (Dashboard → Authentication → URL Configuration):
   - **Site URL**: `https://<your-domain>`
   - **Redirect URLs**: `https://<your-domain>/auth/callback` (plus your Vercel
     preview URL pattern if you want auth on previews).

5. Collect keys (Dashboard → Project Settings → API):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` — **server-only**: never
     expose it to the browser or commit it anywhere. No app code path currently
     uses it (reserved for trusted server-side workflows; `/api/health` reports
     its presence).

### Post-migration smoke

Run in order after the first Vercel deploy (§4), against the production URL:

1. `GET /api/health` returns 200 with `supabase: "configured"`.
2. First real sign-up creates a `public.profiles` row with role `seeker`.
   All auth flags default to `false`, so enable **one** provider for this —
   its smoke ([`BETA_READINESS.md §17`](BETA_READINESS.md#17-social--phone-auth-verification))
   doubles as this check. Passing proves the `on_auth_user_created` trigger
   **and** the `20260707…` table grants in one step; without the grants the
   sign-in mints a session, then bounces back to `/login` with
   `permission denied for table profiles` (42501) in the logs.
3. Promote the founding admin **manually via SQL** (§5 below).
4. `/admin` (as that admin) shows live queue counts — not the "Admin setup
   required" panel.
5. Every other `NEXT_PUBLIC_AUTH_*` flag stays `false` until its own
   provider smoke passes
   ([`BETA_READINESS.md §17`](BETA_READINESS.md#17-social--phone-auth-verification),
   [`LAUNCH_CHECKLIST.md §12`](LAUNCH_CHECKLIST.md#12-social--phone-auth-providers)).

## 3. Payments (de-scoped in Slice 23)

Payments and paid boosts were de-scoped from the MVP in Slice 23; the
`jobs.boost` column, enum, and write-protection triggers remain in the schema,
intentionally unused. Revisit post-beta.

No Stripe account, products, keys, or webhook endpoint are needed to deploy.
This numbered section is kept as a stub so cross-references to later sections
stay stable.

## 4. Vercel

1. Import the Git repository into Vercel. Framework preset **Next.js**, default
   build settings (`npm run build`). No custom output config is required.
2. Set environment variables (Project → Settings → Environment Variables). Use
   Production values only on Production; test-mode values on Preview.

   | Variable | Example / placeholder | Scope | Notes |
   |---|---|---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` | client | Canonical/OG/sitemap base; falls back to localhost if unset |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | client | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon-public-key>` | client | RLS is the authorization gate |
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | server-only | Reserved for trusted server-side workflows; no app code path uses it |
   | `EMAIL_PROVIDER` | `dev` | server-only | Real delivery (`resend`/`sendgrid`) is deferred; `dev` logs stubs |
   | `EMAIL_FROM` | `K-Work US <no-reply@your-domain>` | server-only | Unused while `EMAIL_PROVIDER=dev` |
   | `RESEND_API_KEY` / `SENDGRID_API_KEY` | *(empty)* | server-only | Only when a real provider is enabled |
   | `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | *(empty)* | client | Referenced but not initialized; leave empty for beta |

   The production build **fails closed**: with `NODE_ENV=production` and
   missing/placeholder Supabase credentials, auth throws instead of silently
   enabling the forgeable dev role-picker.

3. Deploy. Then complete the
   [post-deploy verification](LAUNCH_CHECKLIST.md#10-qa--verification) —
   at minimum: `/`, `/jobs`, a job detail page, `/robots.txt`, `/sitemap.xml`,
   sign-up → apply, and employer posting → admin approval.

## 5. First admin account

The seed ships no admin, and there is deliberately no UI or API to grant the
role (self-promotion is blocked by a DB trigger + RLS). After the very first
sign-up, promote that user in the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';  -- Authentication → Users → copy the user's UUID
```

Verify by signing in and opening `/admin`. Details and verification steps:
[launch checklist §4](LAUNCH_CHECKLIST.md#4-admin-setup).

## 6. Known issues

- **Windows + non-ASCII project path (Turbopack panic).** On Windows, `next
  build`/`next dev` can crash with a Rust char-boundary panic when the project
  sits in a path containing non-ASCII (e.g. Korean) characters. This is a
  toolchain issue, not app code — move/clone the repo to an ASCII-only path
  (e.g. `C:\work\k-work-us`) instead of patching the app. CI/Vercel builds are
  unaffected.
- **Email delivery is a dev stub.** `EMAIL_PROVIDER=dev` logs notification
  events server-side; no real email/SMS is sent during the beta.
- **Browser E2E is deferred.** Automated coverage is Vitest (unit +
  server-render smoke tests); the manual QA script in the launch checklist
  covers real-browser flows at 390px/1440px.
