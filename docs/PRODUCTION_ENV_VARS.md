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
(as coarse statuses only, never values), while `GET /api/ready` performs a
two-second, cookie-free anon read from `public_job_listings` and returns only
`ok` or `unavailable` —
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
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | client | Vercel (Production scope) | `true` | `npm run build:release` requires exactly `true`; enable it only after the hosted Google authentication flow has passed its smoke test. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Vercel; same Supabase page | `<service-role-key>` | Bypasses RLS entirely. Used only by the authorized notification worker and signed email webhook. User forms and admin queue reads use session clients/RLS; never expose this key to the browser. |

> **Stripe variables removed (Slice 23).** Payments and paid boosts were
> de-scoped from the MVP in Slice 23, so `STRIPE_SECRET_KEY`,
> `STRIPE_WEBHOOK_SECRET`, `STRIPE_FEATURED_PRICE_ID`,
> `STRIPE_URGENT_PRICE_ID`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are no
> longer read by any code and must not be configured. Revisit post-beta.

## Transactional email (required for release)

| Variable | Exposure | Validation / behavior |
|---|---|---|
| `EMAIL_PROVIDER` | server-only | Exactly `resend` for release. `dev` keeps development logs only; it never sends email. SendGrid is unsupported. |
| `EMAIL_NOTIFICATIONS_ENABLED` | server-only | Exactly `true` enables the worker. Missing/false fails closed before claiming rows. |
| `EMAIL_ENVIRONMENT` | server-only | Exactly `staging` or `production`. Set explicitly for each deployment. |
| `EMAIL_STAGING_ALLOWLIST` | server-only | Required in staging: comma-separated exact controlled mailbox addresses. Empty entries, wildcard entries, and unmatched recipients fail closed; matching does not redirect email. |
| `EMAIL_FROM` | server-only | One mailbox on the operator's verified sending domain, optionally `K-Work US <mailbox>`. No domain has been selected. |
| `RESEND_API_KEY` | server-only | Separate staging and production keys. Pinned official SDK `resend@6.26.0` sends only to Resend's official API. |
| `RESEND_WEBHOOK_SECRET` | server-only | Separate staging and production signing secrets for `/api/webhooks/email`. Subscribe to `email.bounced` and `email.complained`. |
| `CRON_SECRET` | server-only | At least 16 random characters. Every-minute Vercel GET `/api/internal/notifications` requires its exact Bearer token. |

`NEXT_PUBLIC_SITE_URL` must be a fixed public HTTPS origin without credentials,
path, query or fragment. Emails contain only a fixed Korean notice and an approved
internal route on that origin. Applicant text, messages and contact fields never
become subjects, body text, HTML, or email links. The current confirmed **Auth**
email supplies the address; `profiles.email` is never routing authority.

Delivery requires `NODE_ENV=production`: development/test runtimes fail closed
before provider or worker client work because the pinned SDK logs raw errors in
those runtimes. The local provider-double test explicitly runs in production
mode. The standalone `build:release` configuration preflight remains independent
of runtime mode; Next establishes its production runtime during the build.

`/api/health` reports email `partial` outside production or for a provider key alone and `configured`
only when the delivery settings and trusted Supabase client are available.
This indicates enabled capability, not proven DNS, provider reachability or inbox
delivery. `/admin` shows AAL2-protected aggregate pending/failed counts, oldest
available timestamp and a warning for a queue delayed over ten minutes.

The worker claims at most five rows, sends sequentially, aborts Auth/DB requests
after five seconds and provider requests after ten seconds, and stops starting
work before its 105-second deadline (`maxDuration=120`). A five-minute DB lease
and attempt compare-and-set recover crashes. Retry delays are 1/5/15/60 minutes,
or a larger provider Retry-After. After five attempts, or an uncertain first send
older than 23 hours, rows remain failed for operator review. Never clear those
fields or issue a new event ID blindly: [Resend retains idempotency keys for
24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys) (rechecked
2026-09-09). A fingerprint prevents retry with changed recipient/from/origin/body;
no raw address or message is stored in the outbox. Changed payloads fail closed.

Webhook verification uses the original raw body and all three Svix headers.
Signed bounce/complaint receipt deduplication and suppression commit together.
Provider ID is authoritative; a validated outbox tag closes the early-webhook or
lost-success-write race. Unknown correlations/DB errors return 503 so Resend can
retry. Users may change their own email preference, but only trusted webhook or
controlled operations may change bounce suppression.

### Provider activation evidence — UNVERIFIED

No hosted email, Vercel, DNS, domain, or mailbox operation was performed for C1.
Local tests use a local HTTP provider double, real local Supabase/Auth, the official
SDK, and genuinely signed fixture webhooks. They do not prove real delivery.
Before activation, the operator must:

1. Select separate staging/production Resend accounts or credentials and webhook
   endpoints/secrets; choose the actual domain and `EMAIL_FROM` mailbox.
2. Verify SPF/DKIM and publish/check DMARC for that sending domain. Keep delivery
   disabled until configuration and domain verification are complete.
3. Choose a Vercel plan supporting every-minute cron (Pro or Enterprise; Hobby
   does not support this schedule), set `CRON_SECRET`, and run `build:release`.
4. Set staging's exact controlled address allowlist. Confirm a non-allowlisted
   fixture is suppressed and signed bounce/complaint retries are accepted.
5. With explicit authorization for the real test address, send one Gmail test;
   record actual provider ID, inbox/spam result and controlled bounce behavior.
   Confirm queue completion and subsequent suppression; retain no private body
   or credentials in evidence. This real test has **not** been sent.

If failures increase or the queue is overdue, inspect trusted provider/cron logs
and aggregate failures. Disable `EMAIL_NOTIFICATIONS_ENABLED` to pause new claims.
Keep pending/sending rows intact for lease/idempotency recovery; investigate expired
uncertain sends with provider records before any manual resend. Never reset or
seed a hosted database to repair the queue.

## Optional analytics

`NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` remain optional. The
analytics provider is not initialized; DB-backed admin analytics works without it.

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
| `NEXT_PUBLIC_AUTH_NAVER_ENABLED` | client | `true` enables the Naver button — additionally requires a valid `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID`. |
| `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID` | client | Slug of the Supabase **custom OIDC provider** registered for Naver (app passes `custom:<slug>`). Lowercase `[a-z0-9_-]`, max 63 chars; invalid values are ignored (Naver stays setup-required). |
| `NEXT_PUBLIC_AUTH_PHONE_ENABLED` | client | `true` enables the phone OTP form once Supabase Phone Auth + an SMS provider are configured in the Supabase dashboard. |

## CI and local development

CI ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs with
**no production secrets by design**: typecheck, lint, tests, and the production
build all execute in the same "Supabase unconfigured" mode as a fresh local
checkout. `npm run build` is therefore a CI compile check; `npm run
build:release` is the deployment gate and must run in the deployment
environment. Never add production secrets to CI.

Locally, copy `.env.example` to `.env.local` (gitignored) and fill in dev/test
values. `tests/security.test.ts` enforces that `.env.example` is the only
tracked env file and that no secret-shaped value is committed anywhere in the
repo — including this page, which is why every example above is a placeholder.

## If a value leaks

1. Rotate at the source: Supabase → Project Settings → API (service role /
   anon).
2. Update the Vercel environment variable (Production scope).
3. Redeploy so the new value takes effect, and review provider logs for misuse.
