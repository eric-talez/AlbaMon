# Operational Health — K-Work US

How to tell, during the private beta, whether a deployed K-Work US instance is
up, configured, and failing closed — and what to do when it is not. Companion
docs: [`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md) is the per-variable
reference behind every check below, [`BETA_READINESS.md`](BETA_READINESS.md) is
the pre-launch verification runbook, [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)
is the sign-off of record (§8 covers monitoring, §9 rollback), and
[`DEPLOYMENT.md`](DEPLOYMENT.md) is the platform setup guide.

No paid observability provider is wired in this build — by design. This page
plus `GET /api/health` and the Vercel/Supabase/Stripe platform logs are the
beta observability layer (§7 covers what comes later).

## 1. Quick health check

```bash
curl -s https://<your-domain>/api/health
```

Expected on a launch-ready production deployment:

```json
{
  "status": "ok",
  "service": "k-work-us",
  "timestamp": "2026-07-06T12:00:00.000Z",
  "checks": {
    "siteUrl": "configured",
    "supabase": "configured",
    "stripe": "configured",
    "email": "deferred",
    "analytics": "deferred"
  }
}
```

- HTTP 200 + `"status": "ok"` → the app process is serving requests.
- Timeout, 5xx, or HTML instead of JSON → the deployment itself is broken;
  go straight to §6.
- `"missing"` / `"partial"` anywhere → the process is up but misconfigured;
  §2 says what each status means, §4 says how the app behaves meanwhile.

## 2. `GET /api/health` reference

Implementation: [`src/app/api/health/route.ts`](../src/app/api/health/route.ts)
→ [`src/lib/ops/health.ts`](../src/lib/ops/health.ts); contract asserted by
[`tests/health.test.ts`](../tests/health.test.ts).

Endpoint properties (safe for public, unauthenticated uptime checks):

- Reports **coarse statuses only** — never env values, key fragments,
  hostnames, or error details.
- **Presence-of-configuration only**: it reads `process.env` through the same
  predicates the app uses. It never connects to Supabase, Stripe, or any
  network service, and never writes anything.
- Always **HTTP 200** while the process can serve requests at all — uptime
  monitors should alert on non-200/timeout, not on body contents.
- `Cache-Control: no-store`, so every probe observes the live process.

| Field | Meaning |
|---|---|
| `status` | `"ok"` whenever the process answered. There is no degraded value — config problems show per-check, not here. |
| `service` | Always `"k-work-us"` — confirms the probe hit this app, not a placeholder page. |
| `timestamp` | Response time (ISO-8601). If repeated probes return the same value, something is caching responses. |
| `checks.*` | One status per config area, see below. |

| Status | Meaning |
|---|---|
| `configured` | Everything the check covers is present. Placeholder fragments from `.env.example` (`your-`, `xxx`, `example`, `placeholder`) count as absent, matching the app's own fail-closed detection. |
| `partial` | Some but not all values present — almost always a misconfiguration; find the missing variable in [`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md). |
| `missing` | Nothing present. Expected in CI and fresh checkouts; a defect in production. |
| `deferred` | Deliberately not wired for the beta (email delivery, analytics). Not an error. |

What each check covers:

| Check | Covers | Expected (prod beta) |
|---|---|---|
| `siteUrl` | `NEXT_PUBLIC_SITE_URL` present and parseable as a URL. Presence only — a stale localhost value in production still reports `configured`; correctness is [`LAUNCH_CHECKLIST.md §1`](LAUNCH_CHECKLIST.md#1-environment-variables). | `configured` |
| `supabase` | Anon auth pair (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) **and** the server-only `SUPABASE_SERVICE_ROLE_KEY` used by the Stripe webhook. `partial` = one side absent. | `configured` |
| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_FEATURED_PRICE_ID`, `STRIPE_URGENT_PRICE_ID`. | `configured` |
| `email` | `deferred` while `EMAIL_PROVIDER` is `dev`/unset (the accepted beta state). A real provider (`resend`/`sendgrid`) without its API key reports `partial`. | `deferred` |
| `analytics` | `NEXT_PUBLIC_POSTHOG_KEY` presence. The provider is **not initialized in this build** — `configured` means the env is staged for a later slice, not that analytics is running. | `deferred` |

What the endpoint deliberately does **not** tell you: whether Supabase or
Stripe are actually reachable, whether migrations are applied, or whether RLS
holds. Presence of config ≠ liveness of providers — those need the platform
dashboards (§5) and [`BETA_READINESS.md`](BETA_READINESS.md) §§4–8.

## 3. Uptime monitoring

Point any external uptime monitor (UptimeRobot, Better Stack, Pingdom, a cron
job — none is bundled and none is required) at:

- URL: `https://<your-domain>/api/health`
- Alert condition: non-200 response or timeout; optionally also require the
  body to contain `"status":"ok"`.
- Interval: 1–5 minutes; alert after 2 consecutive failures to skip blips.

The endpoint is public and secret-free precisely so a third-party pinger can
hit it without credentials. Checking `/` as a second probe also catches
rendering-level breakage the API route cannot see.

## 4. What missing config does to the app (fail-closed map)

The app is designed to fail closed; `/api/health` is how you see that state
from outside. Verified behaviors:

| Config absent | Health shows | App behavior |
|---|---|---|
| Supabase auth pair (production) | `supabase: missing`/`partial` | Auth **throws** instead of silently enabling the forgeable dev role-picker: Vercel logs show `Auth is misconfigured: production requires real Supabase credentials` (`src/lib/supabase/config.ts`). Public pages may still render; sign-in/role flows fail loudly. |
| Supabase auth pair (local/preview) | same | Dev role-picker mode — intended for development only. |
| `SUPABASE_SERVICE_ROLE_KEY` only | `supabase: partial` | Auth works, but webhook-driven boost activation fails (`src/lib/supabase/service.ts` throws; `[payments]` errors in logs). |
| Stripe checkout vars | `stripe: missing`/`partial` | Boost page fails closed — no checkout session is created (`src/lib/payments/config.ts`). |
| `STRIPE_WEBHOOK_SECRET` | `stripe: partial` | `/api/stripe/webhook` answers **503 `unavailable`**; Stripe retries and its dashboard shows the failures. A wrong (vs missing) secret shows **400 `bad_signature`** instead. |
| `NEXT_PUBLIC_SITE_URL` | `siteUrl: missing` | Silent fallback to `http://localhost:3000` for canonical/OG/sitemap URLs and Stripe redirect URLs — pages render but links are wrong. This is the one silent failure the health check exists to surface. |
| Email provider | `email: deferred` | Expected: **no email is ever sent in the beta.** Notification events log as `[notification:dev]` outside production and are silently skipped in production (`src/lib/notifications/dev.ts`). |
| Analytics | `analytics: deferred` | Nothing — no analytics code runs in this build. |

## 5. Log triage — where to look when a flow fails

Server logs use stable prefixes, so Vercel's log search finds them directly:

| Prefix | Emitted by |
|---|---|
| `[db]` | Every Supabase query helper in `src/lib/db/*` (failures name the function, e.g. `[db] createApplication failed`). In production these rethrow — they surface as request errors, never as silent mock-data fallbacks. |
| `[payments]` | Boost checkout + activation (`src/lib/payments/boosts.ts`). Deliberately message-only — no Stripe error objects, no ids. |
| `[notification]` / `[notification:dev]` | Notification stubs and their call sites (apply, messaging, status changes). |

By symptom:

| Symptom | Check first | Then |
|---|---|---|
| Site down / all pages erroring | `/api/health`, Vercel → Deployments (did a deploy or env edit just precede it?) | Roll back per §6; Vercel function logs for the crash. |
| Sign-in / signup failing | `checks.supabase` | Vercel logs for `Auth is misconfigured` (fail-closed config) → Supabase Dashboard → Logs → Auth (provider/email issues, rate limits). |
| Applications, messaging, or reports failing | Vercel logs for `[db]` | Supabase Dashboard → Logs → Postgres. Permission-denied errors here usually mean an RLS policy blocked a write the UI allowed — treat as a bug, cross-check [`LAUNCH_CHECKLIST.md §7`](LAUNCH_CHECKLIST.md#7-rls--security-review). |
| Boost checkout not starting | `checks.stripe` | Vercel logs for `[payments]` → Stripe Dashboard → Developers → Logs. |
| Paid boost never activates | Stripe Dashboard → Webhooks → endpoint → deliveries | 503 = webhook secret missing; 400 = signature mismatch (test/live endpoint or secret mixup — each endpoint has its own `whsec_...`); 200 but no badge = check `[payments] boost activation failed` and `checks.supabase` (service-role key). |
| "I never got an email" | `checks.email` | Expected during beta (`deferred`) — no email is sent; support replies come via the human channel in [`LAUNCH_CHECKLIST.md §8`](LAUNCH_CHECKLIST.md#8-monitoring--operations). |

## 6. Incident response (private-beta minimum)

Severity triage — respond top-down:

- **S1 — stop everything**: site down, any suspected data exposure or secret
  leak, auth letting the wrong role through.
- **S2 — same day**: a core flow broken for everyone (sign-in, browse/apply,
  posting, moderation).
- **S3 — next working session**: degraded non-core flows (boosts, admin
  analytics), cosmetic issues.

First 15 minutes:

1. Confirm scope: `curl /api/health`, open `/` and `/jobs` signed out.
2. Correlate: Vercel → Deployments — did a deploy or env-var change
   immediately precede the breakage? Config edits only apply on redeploy, so a
   stale-looking config bug usually means "someone edited env and redeployed".
3. Read the logs per §5 before changing anything — capture the exact error
   line and timestamp.
4. Mitigate:
   - Bad deploy → promote the previous production deployment
     ([`LAUNCH_CHECKLIST.md §9`](LAUNCH_CHECKLIST.md#9-rollback-notes) — the
     app is stateless, rollback is safe at any time).
   - Bad/missing env value → fix in Vercel, redeploy, re-check `/api/health`.
   - Stripe misbehaving → freeze payments: disable the live webhook endpoint
     and/or archive the boost prices; the app fails closed (§4) while frozen.
   - Suspected secret leak → **rotate first**, ask questions after:
     [`PRODUCTION_ENV_VARS.md` → "If a value leaks"](PRODUCTION_ENV_VARS.md#if-a-value-leaks).
5. Tell the beta users through the support channel named in
   [`LAUNCH_CHECKLIST.md §8`](LAUNCH_CHECKLIST.md#8-monitoring--operations) if
   the incident is S1/S2 — a one-liner ("we know, fix in progress") is enough
   for a private beta.

Afterwards, write a five-line note in the team channel: what broke, user
impact, root cause, the fix, and the one thing that would have caught it
sooner. If that one thing is a missing runbook entry, add it to this page.

## 7. Deferred observability (post-beta)

Deliberately out of scope for this slice — the beta runs zero-dependency:

- **Error tracking (e.g. Sentry)**: would wrap server actions and route
  handlers; until then, Vercel function logs are the error store.
- **Product analytics (e.g. PostHog/Plausible)**: `NEXT_PUBLIC_POSTHOG_KEY` /
  `NEXT_PUBLIC_POSTHOG_HOST` are already reserved in `.env.example`, and
  `checks.analytics` will flip to `configured` once a key is set — but no
  client code initializes a provider in this build. DB-backed admin KPIs
  (`/admin/analytics`) work without it.
- **Alerting**: covered externally by the §3 uptime monitor; nothing in-app.

When a provider slice lands, keep `/api/health` as the cheap public layer:
provider SDKs stay out of `src/lib/ops/health.ts` so the endpoint keeps its
no-network, no-secrets contract.
