# Operational Health — K-Work US

How to tell, during the private beta, whether a deployed K-Work US instance is
up, configured, and failing closed — and what to do when it is not. Companion
docs: [`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md) is the per-variable
reference behind every check below, [`BETA_READINESS.md`](BETA_READINESS.md) is
the pre-launch verification runbook, [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)
is the sign-off of record (§8 covers monitoring, §9 rollback), and
[`DEPLOYMENT.md`](DEPLOYMENT.md) is the platform setup guide.

No paid observability provider is wired in this build — by design. This page
plus `GET /api/health` and the Vercel/Supabase platform logs are the
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
    "email": "configured",
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
  predicates the app uses. It never connects to Supabase or any
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
| `deferred` | Disabled/unselected integrations (email dev mode, analytics). |

What each check covers:

| Check | Covers | Expected (prod beta) |
|---|---|---|
| `siteUrl` | `NEXT_PUBLIC_SITE_URL` present and parseable as a URL. Presence only — a stale localhost value in production still reports `configured`; correctness is [`LAUNCH_CHECKLIST.md §1`](LAUNCH_CHECKLIST.md#1-environment-variables). | `configured` |
| `supabase` | Anon auth pair (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) **and** the server-only `SUPABASE_SERVICE_ROLE_KEY` (used only by the notification worker and signed webhook). `partial` = one side absent. | `configured` |
| `email` | `deferred` for `dev`/unset. A key alone is `partial`; `configured` requires enabled Resend delivery, origin/from, webhook/cron settings, environment/allowlist and trusted Supabase configuration. See the [activation evidence](PRODUCTION_ENV_VARS.md#provider-activation-evidence--unverified). | `configured` |
| `analytics` | `NEXT_PUBLIC_POSTHOG_KEY` presence. The provider is **not initialized in this build** — `configured` means the env is staged for a later slice, not that analytics is running. | `deferred` |

What the endpoint deliberately does **not** tell you: whether Supabase is
actually reachable, whether migrations are applied, or whether RLS
holds. Presence of config ≠ liveness of providers — those need the platform
dashboards (§5) and [`BETA_READINESS.md`](BETA_READINESS.md) §§4–7.

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
| `SUPABASE_SERVICE_ROLE_KEY` only | `supabase: partial` | Auth works; notification claims and signed suppression cannot reach the trusted DB and return 503. Restore the server-only key without exposing it to app/browser clients. |
| `NEXT_PUBLIC_SITE_URL` | `siteUrl: missing` | Silent fallback to `http://localhost:3000` for canonical/OG/sitemap URLs — pages render but links are wrong. This is the one silent failure the health check exists to surface. |
| Email provider | `email: deferred` | Delivery is disabled. Business transactions still enqueue durable events; development logs remain separate and never send. Restore the required settings before enabling the worker. |
| Analytics | `analytics: deferred` | Nothing — no analytics code runs in this build. |

## 5. Log triage — where to look when a flow fails

Server logs use stable prefixes, so Vercel's log search finds them directly:

| Prefix | Emitted by |
|---|---|
| `[db]` | Every Supabase query helper in `src/lib/db/*` (failures name the function, e.g. `[db] createApplication failed`). In production these rethrow — they surface as request errors, never as silent mock-data fallbacks. |
| `[notification]` / `[notification:dev]` | Notification stubs and their call sites (apply, messaging, status changes). |

By symptom:

| Symptom | Check first | Then |
|---|---|---|
| Site down / all pages erroring | `/api/health`, Vercel → Deployments (did a deploy or env edit just precede it?) | Roll back per §6; Vercel function logs for the crash. |
| Sign-in / signup failing | `checks.supabase` | Vercel logs for `Auth is misconfigured` (fail-closed config) → Supabase Dashboard → Logs → Auth (provider/email issues, rate limits). If sign-in completes but immediately bounces back to `/login`: look for `permission denied for table profiles` (42501) — the project is missing the `20260707…` explicit-grants migration ([`BETA_READINESS.md §5`](BETA_READINESS.md#5-migration-verification)). |
| Applications, messaging, or reports failing | Vercel logs for `[db]` | Supabase Dashboard → Logs → Postgres. Permission-denied errors here usually mean an RLS policy blocked a write the UI allowed — treat as a bug, cross-check [`LAUNCH_CHECKLIST.md §7`](LAUNCH_CHECKLIST.md#7-rls--security-review). Exception: 42501 across many tables right after a deploy means missing **table grants**, not RLS — verify all 10 migrations incl. `20260707…` are applied ([`BETA_READINESS.md §5`](BETA_READINESS.md#5-migration-verification)). |
| "I never got an email" | `checks.email` | Check the AAL2 admin email queue card, cron/provider logs, current confirmed Auth address and preference/suppression. A key alone is partial configuration; actual provider/DNS/inbox evidence is separate. |

## 6. Incident response (private-beta minimum)

Severity triage — respond top-down:

- **S1 — stop everything**: site down, any suspected data exposure or secret
  leak, auth letting the wrong role through.
- **S2 — same day**: a core flow broken for everyone (sign-in, browse/apply,
  posting, moderation).
- **S3 — next working session**: degraded non-core flows (admin
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

- **Payments observability**: payments and paid boosts were de-scoped from the
  MVP in Slice 23; the `jobs.boost` column, enum, and write-protection
  triggers remain in the schema, intentionally unused. Revisit post-beta.
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


## CA publication signals (C4)

`/admin/analytics` calls `admin_marketplace_signals(reference_date)` as the verified session. The database requires a currently active AAL2 admin; it returns aggregates only, without applicant/message bodies. Existing all-status moderation totals remain separate.

- `cohortCount`: CA workplace jobs whose latest actual `posted_at` is in the inclusive interval `[referenceDate − 28 days, referenceDate − 7 days]`. Closed, expired and paused historical publications remain eligible. No owner-status exclusion. Unknown historical publication timestamps are excluded and belong to the D1 inventory; never fabricate a backfill. Reposting uses the current/latest publication timestamp.
- `appliedWithin7Days`: cohort jobs with at least one application in the inclusive interval `[posted_at, posted_at + 7 days]`, excluding currently withdrawn applications and applicants whose profile is currently suspended. The headline percentage is `100 × appliedWithin7Days / cohortCount`; no cohort renders “관찰 가능한 공고 없음”, not 0%.
- `medianFirstEmployerReplyHours`: use the same eligible applications. For each, take the first message whose sender is the current company owner and whose timestamp is in `[application.created_at, referenceDate]`. Compute elapsed hours from application creation; median only among answered applications. No answered samples means null, not zero hours.
- `unansweredApplicationCount`: eligible applications with no qualifying reply. Seeker/admin/nonowner messages do not count. Ownership transfer is not currently a product flow; if introduced, historical attribution needs an immutable ownership record.

The aggregate runs inside Postgres, so the REST 1,000-row limit does not truncate the population. These are publication/application/reply signals, not visit conversion, retention, or completed hires. `offered` means an offer status only. External product analytics and visit collection remain deferred.

Public SEO uses the canonical open-job view (`is_job_open`) through an anonymous cookie-free dynamic sitemap, reading every stable-ID range of 1,000. Database/configuration failure fails the sitemap safely; it never emits mocks or a partial success response. Split sitemaps before 50,000 total URLs (including static pages). JobPosting includes only visible facts and full paragraph-formatted employer content, with HTML escaping followed by separate script serialization escaping. Unknown posted_at yields no JobPosting. Closed/expired jobs return 404 and disappear from the sitemap. [Google’s JobPosting guidance](https://developers.google.com/search/docs/appearance/structured-data/job-posting) does not guarantee search exposure; deployed-domain Search Console and URL Inspection are external release gates.
