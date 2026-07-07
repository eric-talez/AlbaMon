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
| `NEXT_PUBLIC_SITE_URL` | client | Vercel (Production scope) | `https://<your-domain>` | Parsed with `new URL()` in `src/lib/site.ts`; malformed/unset falls back to `http://localhost:3000`. A wrong value silently breaks canonical/OG/sitemap URLs. |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Vercel; value from Supabase → Project Settings → API | `https://<project-ref>.supabase.co` | Placeholder fragments (`your-project`, `example.com`) are treated as *unconfigured* (`src/lib/supabase/config.ts`). In production the app then **fails closed**: auth throws instead of enabling the forgeable dev role-picker. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Vercel; same Supabase page | `<anon-public-key>` | Safe to expose **only** because RLS is the authorization gate. The `your-anon-key` fragment counts as unconfigured (same fail-closed behavior). Never commit the real JWT-shaped value — `tests/security.test.ts` blocks it. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Vercel; same Supabase page | `<service-role-key>` | Bypasses RLS entirely. No app code path currently uses it — the client in `src/lib/supabase/service.ts` is reserved for trusted server-side workflows, and `/api/health` reports the key's *presence* only. Keep any future usage restricted to trusted server flows. |

> **Stripe variables removed (Slice 23).** Payments and paid boosts were
> de-scoped from the MVP in Slice 23, so `STRIPE_SECRET_KEY`,
> `STRIPE_WEBHOOK_SECRET`, `STRIPE_FEATURED_PRICE_ID`,
> `STRIPE_URGENT_PRICE_ID`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are no
> longer read by any code and must not be configured. Revisit post-beta.

## Optional / deferred variables

Declared in `.env.example` but **not used by any product feature in this
build**. Leave them unset or empty for the beta. (The only code that looks at
them is the ops health module, `src/lib/ops/health.ts`, which reports their
*presence* as a coarse status on the public `GET /api/health` endpoint — never
their values. See [`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md).)

| Variable | Exposure | Status |
|---|---|---|
| `EMAIL_PROVIDER` | server-only | Keep `dev` for the beta (server-side logging stub). Real `resend` / `sendgrid` delivery is deferred. |
| `EMAIL_FROM` | server-only | Unused while `EMAIL_PROVIDER=dev`. |
| `RESEND_API_KEY`, `SENDGRID_API_KEY` | server-only | Only needed once a real email provider is enabled (deferred). |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | client | Analytics provider is not initialized in this build; leave empty. DB-backed admin analytics works without them. |

### Auth provider flags (Slice 19)

Public **booleans, not secrets** — they only decide whether a sign-in method
renders as clickable. The real OAuth/SMS credentials live exclusively in the
Supabase dashboard (see [`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md)). All default
off; leave them unset until the matching provider is configured in Supabase.
`NEXT_PUBLIC_*` values are inlined into the client bundle at build time, so a
change requires a redeploy. A method with its flag off (or Supabase
unconfigured) shows a "setup required" state — nothing breaks.

| Variable | Exposure | Status |
|---|---|---|
| `NEXT_PUBLIC_AUTH_KAKAO_ENABLED` | client | `true` enables the KakaoTalk button once the Kakao provider is configured in Supabase. |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | client | `true` enables the Google button once the Google provider is configured in Supabase. |
| `NEXT_PUBLIC_AUTH_NAVER_ENABLED` | client | `true` enables the Naver button — additionally requires a valid `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID`. |
| `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID` | client | Slug of the Supabase **custom OIDC provider** registered for Naver (app passes `custom:<slug>`). Lowercase `[a-z0-9_-]`, max 63 chars; invalid values are ignored (Naver stays setup-required). |
| `NEXT_PUBLIC_AUTH_PHONE_ENABLED` | client | `true` enables the phone OTP form once Supabase Phone Auth + an SMS provider are configured in the Supabase dashboard. |

## CI and local development

CI ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs with
**no production secrets by design**: typecheck, lint, tests, and the production
build all execute in the same "Supabase unconfigured" mode as a fresh
local checkout. Never add production secrets to CI.

Locally, copy `.env.example` to `.env.local` (gitignored) and fill in dev/test
values. `tests/security.test.ts` enforces that `.env.example` is the only
tracked env file and that no secret-shaped value is committed anywhere in the
repo — including this page, which is why every example above is a placeholder.

## If a value leaks

1. Rotate at the source: Supabase → Project Settings → API (service role /
   anon).
2. Update the Vercel environment variable (Production scope).
3. Redeploy so the new value takes effect, and review provider logs for misuse.
