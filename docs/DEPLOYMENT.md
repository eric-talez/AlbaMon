# Deployment — Vercel + Supabase

How to deploy K-Work US for the private beta. The app is a standard Next.js 16
App Router project: **Vercel** hosts the app, **hosted Supabase** provides
Auth + Postgres (with RLS), and **Stripe** powers boost checkout. Nothing in
this guide contains real credentials — every value shown is a placeholder.

Companion docs:

- [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) — go/no-go checklist for the beta.
- [`../supabase/README.md`](../supabase/README.md) — schema, migrations & seed details.
- [`DATABASE.md`](DATABASE.md) — schema and access-layer reference.

## 1. Prerequisites

- Node.js 20+ and npm 10+ (`npm install`, `npm run build` must pass locally).
- A [Supabase](https://supabase.com) account + [Supabase CLI](https://supabase.com/docs/guides/cli).
- A [Vercel](https://vercel.com) account with access to this Git repository.
- A [Stripe](https://stripe.com) account (test mode is enough until launch).
- Optional: [Stripe CLI](https://stripe.com/docs/stripe-cli) for local webhook testing.

## 2. Supabase (hosted project)

1. Create a new Supabase project (region close to LA/OC users, e.g. `us-west-1`).
2. Link and push migrations from the repo root:

   ```bash
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
   | 5 | `20260625000000_employer_write_hardening.sql` | Verification/boost write guards |
   | 6 | `20260626000000_application_messages.sql` | Participant-bound message threads |
   | 7 | `20260627000000_application_status_workflow.sql` | Application status constraint + policies |
   | 8 | `20260628000000_report_queue_hardening.sql` | Report reason/status constraints + RLS |

   Without the CLI: run each file in the Supabase **SQL editor**, in the same
   order.

3. **Do not run `supabase/seed.sql` against production.** It creates fictional
   demo employers, companies, and jobs with well-known UUIDs and a shared
   password — it exists for local dev and demos only. See the
   [launch checklist](LAUNCH_CHECKLIST.md#3-seed--demo-data) for how to verify
   none of it is present.

4. Configure Auth (Dashboard → Authentication → URL Configuration):
   - **Site URL**: `https://<your-domain>`
   - **Redirect URLs**: `https://<your-domain>/auth/callback` (plus your Vercel
     preview URL pattern if you want auth on previews).

5. Collect keys (Dashboard → Project Settings → API):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` — **server-only**: never
     expose it to the browser or commit it anywhere. The app uses it in exactly
     one place (Stripe webhook boost activation after signature verification).

## 3. Stripe

1. In **test mode**, create two Products with one-time Prices (the boost SKUs):
   - "Featured boost" → copy its price id into `STRIPE_FEATURED_PRICE_ID`
   - "Urgent boost" → copy its price id into `STRIPE_URGENT_PRICE_ID`
2. Copy API keys (Developers → API keys):
   - Secret key (`sk_test_...`) → `STRIPE_SECRET_KEY`
   - Publishable key (`pk_test_...`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Register the webhook endpoint (Developers → Webhooks → Add endpoint):
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`
   - Copy the signing secret (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`
4. Local webhook testing (optional):

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Use the temporary `whsec_...` the CLI prints as `STRIPE_WEBHOOK_SECRET` in
   `.env.local`.

5. **Going live**: repeat steps 1–3 in live mode (live products/prices, live
   keys, a live-mode webhook endpoint with its own signing secret). Keep test
   keys on Preview environments and live keys **only** on Production.

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
   | `SUPABASE_SERVICE_ROLE_KEY` | `<service-role-key>` | server-only | Webhook boost activation only |
   | `STRIPE_SECRET_KEY` | `sk_test_...` / `sk_live_...` | server-only | |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` | server-only | Per endpoint (test vs live differ) |
   | `STRIPE_FEATURED_PRICE_ID` | `price_...` | server-only | |
   | `STRIPE_URGENT_PRICE_ID` | `price_...` | server-only | |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` / `pk_live_...` | client | |
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
   sign-up → apply, employer posting → admin approval, and a test-mode boost
   checkout whose webhook delivery shows `200` in the Stripe dashboard.

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
