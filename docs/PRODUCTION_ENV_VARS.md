# Production Environment Variables — K-Work US

Per-variable reference for everything the app reads (or reserves) in
production. **Every value on this page is a placeholder** — real values live
only in Vercel project settings (and locally in the gitignored `.env.local`).

Companion docs: [`../.env.example`](../.env.example) is the canonical variable
list; [`DEPLOYMENT.md §4`](DEPLOYMENT.md#4-vercel) is the procedure for setting
values in Vercel; [`LAUNCH_CHECKLIST.md §1`](LAUNCH_CHECKLIST.md#1-environment-variables)
is the launch sign-off. This page adds what those do not: required/optional
status, exposure semantics, and validation/failure behavior with code pointers.
After deploying, `GET /api/health` reports whether these variables are present
(as coarse statuses only, never values) —
[`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md) is the reference.

## How to read this page

- **Required** — the private beta cannot operate correctly without it.
- **client** — `NEXT_PUBLIC_*` values are inlined into the browser JavaScript
  bundle at build time and are visible to every visitor. Never put a secret in
  a `NEXT_PUBLIC_*` variable; renaming a secret to `NEXT_PUBLIC_*` is a
  security incident (rotate it), not a configuration tweak.
- **server-only** — read only in server code. Must never gain a `NEXT_PUBLIC_*`
  twin, be echoed to logs, or be committed to the repo.

## Required variables

| Variable | Exposure | Where configured | Placeholder | Validation / failure mode |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | client | Vercel (Production scope) | `https://<your-domain>` | Parsed with `new URL()` in `src/lib/site.ts`; malformed/unset falls back to `http://localhost:3000`. Trailing slashes are trimmed for Stripe redirect URLs (`src/lib/payments/config.ts`). A wrong value silently breaks canonical/OG/sitemap URLs and Stripe checkout redirects. |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Vercel; value from Supabase → Project Settings → API | `https://<project-ref>.supabase.co` | Placeholder fragments (`your-project`, `example.com`) are treated as *unconfigured* (`src/lib/supabase/config.ts`). In production the app then **fails closed**: auth throws instead of enabling the forgeable dev role-picker. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Vercel; same Supabase page | `<anon-public-key>` | Safe to expose **only** because RLS is the authorization gate. The `your-anon-key` fragment counts as unconfigured (same fail-closed behavior). Never commit the real JWT-shaped value — `tests/security.test.ts` blocks it. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Vercel; same Supabase page | `<service-role-key>` | Bypasses RLS entirely. Used in exactly one flow: boost activation inside the signature-verified Stripe webhook (`src/lib/supabase/service.ts` → `src/lib/payments/boosts.ts`). Keep service-role usage restricted to trusted server/webhook flows only. |
| `STRIPE_SECRET_KEY` | **server-only** | Vercel; Stripe → Developers → API keys | `sk_live_...` (Production) / `sk_test_...` (Preview) | Test vs live mode is inferred from the key prefix. Placeholder fragments (`xxx`, `your-`, `example`, `placeholder`) count as unconfigured → boost checkout fails closed (`src/lib/payments/config.ts`). |
| `STRIPE_WEBHOOK_SECRET` | **server-only** | Vercel; per Stripe webhook endpoint | `whsec_...` | Each endpoint (test vs live) has its **own** signing secret. Signatures are verified with HMAC-SHA256 (`node:crypto`); a bad or missing signature is rejected with a 4xx before any database write. |
| `STRIPE_FEATURED_PRICE_ID` | **server-only** | Vercel; Stripe Products (live prices for Production) | `price_...` | Mapped by `getStripePriceId("featured")` in `src/lib/payments/config.ts`. Empty/placeholder → the featured boost is unconfigured and the boost page fails closed. |
| `STRIPE_URGENT_PRICE_ID` | **server-only** | Vercel; Stripe Products (live prices for Production) | `price_...` | Same as above, for `getStripePriceId("urgent")`. |

## Optional / deferred variables

Declared in `.env.example` but **not used by any product feature in this
build**. Leave them unset or empty for the beta. (The only code that looks at
them is the ops health module, `src/lib/ops/health.ts`, which reports their
*presence* as a coarse status on the public `GET /api/health` endpoint — never
their values. See [`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md).)

| Variable | Exposure | Status |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Reserved for future Stripe.js usage (`pk_live_...` / `pk_test_...`); checkout currently happens on Stripe-hosted pages. |
| `EMAIL_PROVIDER` | server-only | Keep `dev` for the beta (server-side logging stub). Real `resend` / `sendgrid` delivery is deferred. |
| `EMAIL_FROM` | server-only | Unused while `EMAIL_PROVIDER=dev`. |
| `RESEND_API_KEY`, `SENDGRID_API_KEY` | server-only | Only needed once a real email provider is enabled (deferred). |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | client | Analytics provider is not initialized in this build; leave empty. DB-backed admin analytics works without them. |

## CI and local development

CI ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs with
**no production secrets by design**: typecheck, lint, tests, and the production
build all execute in the same "Supabase/Stripe unconfigured" mode as a fresh
local checkout. Never add production secrets to CI.

Locally, copy `.env.example` to `.env.local` (gitignored) and fill in dev/test
values. `tests/security.test.ts` enforces that `.env.example` is the only
tracked env file and that no secret-shaped value is committed anywhere in the
repo — including this page, which is why every example above is a placeholder.

## If a value leaks

1. Rotate at the source: Supabase → Project Settings → API (service role /
   anon), or Stripe → Developers → API keys / Webhooks (roll the key or the
   endpoint signing secret).
2. Update the Vercel environment variable (Production scope).
3. Redeploy so the new value takes effect, and review provider logs for misuse.
