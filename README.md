# K-Work US

Korean-English **bilingual** local hiring marketplace for the U.S. Korean
community. Mobile-first. Initial market: **LA / Orange County**.

> Positioning: bilingual / community-friendly local jobs — **not** Korean-only
> hiring. See [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md) and the full plan in
> [`docs/K-Work_US_Development_Plan.pdf`](docs/K-Work_US_Development_Plan.pdf).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4**
- **Supabase Auth + Postgres + Row Level Security**
- **Vitest** for unit tests
- Planned: Resend/SendGrid email

## Local setup

Requirements: Node.js 20+, npm 10+.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (placeholders are fine to start the UI)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

With the `.env.example` placeholders left in place the app runs in **dev
mode** (mock role-picker auth, mock job data). To run against a **real local
Auth + Postgres stack** instead, see the
[Local Supabase](#local-supabase-slice-20) section below.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint (Next.js config). |
| `npm run typecheck` | TypeScript `--noEmit` strict check. |
| `npm test` | Run unit tests once (Vitest). |
| `npm run test:watch` | Watch-mode tests. |
| `npm run verify:beta` | Beta-readiness docs gate (see [`docs/BETA_READINESS.md`](docs/BETA_READINESS.md)). |
| `npm run verify:local-supabase` | Local Supabase readiness gate (see [`docs/LOCAL_SUPABASE.md`](docs/LOCAL_SUPABASE.md)). |

## Continuous integration

Every pull request and every push to `main` runs the CI gate in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) (GitHub Actions,
Node 22). One job runs these steps in order, and any failure fails the run:

| Step | Command |
| --- | --- |
| Install exact locked dependencies | `npm ci` |
| Whitespace check — every tracked file | `git diff --check` against git's empty tree |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Production build | `npm run build` |

CI needs **no secrets or environment variables**: like a fresh checkout, it
runs in the unconfigured dev/mock mode (see the mock-fallback notes below),
so the gate never depends on live Supabase. To reproduce the
whitespace check locally:

```bash
git diff --check "$(git hash-object -t tree /dev/null)" HEAD
```

To make the gate **blocking** (a true release gate), enable branch
protection on `main` and mark the CI job as a required status check
(GitHub → Settings → Branches). Superseded runs on PR branches are
auto-cancelled; runs on `main` always complete.

## Project structure

```
src/
  app/                 # App Router routes (public, auth, employer, admin)
  components/           # UI + auth components
  lib/
    auth/               # roles, permission matrix, server-side guards, sessions
    supabase/           # browser/server clients + proxy session helper
    db/                 # DB row types + approved-job reads (mock fallback)
    ops/                # operational health report backing GET /api/health
    ...                 # site config, types, mock data (validation/compliance later)
  proxy.ts              # Next 16 "proxy" (renamed middleware): Supabase session refresh
tests/                 # Vitest unit tests
docs/                  # PRODUCT_BRIEF, DATABASE.md, development plan, policies
supabase/
  migrations/           # DB schema + RLS (source of truth)
  seed.sql              # LA/OC demo companies + jobs
```

## Auth & roles (Slice 2)

Three roles: **seeker**, **employer**, **admin**. Authorization is enforced
**server-side** — the central permission matrix lives in
[`src/lib/auth/access.ts`](src/lib/auth/access.ts) and guards in
[`src/lib/auth/guards.ts`](src/lib/auth/guards.ts) redirect unauthenticated users
to `/login` and wrong-role users to `/forbidden`. UI checks are never the only
protection.

| Area | Allowed roles |
| --- | --- |
| `/dashboard` | any signed-in user |
| `/employer/**` | employer, admin |
| `/admin/**` | admin only |

**Dev-auth mode:** with the placeholder Supabase values in `.env.example`, the app
runs in a cookie-based **dev-auth mode** — open `/login`, pick a role, and the
guards behave as in production. Fill in real `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to switch to real Supabase auth. No secrets are
committed.

## Database (Slice 3)

The Postgres schema lives in [`supabase/`](supabase/) and is the source of truth:
enums, the eight core tables (`profiles`, `companies`, `jobs`, `applications`,
`messages`, `reports`, `employer_access_requests`, `audit_logs`), constraints, an
`updated_at` trigger, authorization helper functions, and **Row Level Security**
on every table. See [`docs/DATABASE.md`](docs/DATABASE.md) for the full schema +
RLS summary and [`supabase/README.md`](supabase/README.md) for how to apply
migrations and seed.

Table privileges for the Supabase API roles are **explicit**
(`20260707000000_explicit_table_grants.sql`): current Supabase applies no
implicit grants, and without that migration real sign-ins mint a session but
fail closed at the `profiles.role` lookup (`permission denied`, 42501) and
bounce back to `/login`. RLS remains the row-level authorization gate on top —
see [`docs/DATABASE.md`](docs/DATABASE.md#table-grants-supabase-api-roles).

```bash
supabase db reset   # apply migrations/ + seed.sql to a local DB (CLI + Docker)
```

**Mock fallback:** the public job pages read through
[`src/lib/db/jobs.ts`](src/lib/db/jobs.ts) (`getApprovedJobs` /
`getApprovedJobById` / `searchApprovedJobs`). When Supabase is **not** configured
in development, tests, or `next build`, they return deterministic mock data. A
production runtime never substitutes mock listings for missing configuration or
a DB outage; those errors are surfaced instead. Configured reads use the
approved-only `public_job_listings` view, which exposes safe company identity
without making the rest of an unverified company profile public.

## Browse, search & roles (Slice 4)

**DB-backed browse/search.** `/jobs` is a server-rendered page driven by URL query
params. [`src/components/JobFilters.tsx`](src/components/JobFilters.tsx) is a plain
**GET form** (works without JavaScript) that submits `q`, `city`, `category`,
`jobType`, `languageRequirement`, `payMin`, and `sort` (`newest` | `pay_high` |
`pay_low`). `searchApprovedJobs()` applies these filters against the DB when
Supabase is configured and against the mock data otherwise — always approved-only,
so pending/draft/rejected jobs are never exposed. Invalid query values are ignored
safely (`parseJobSearchParams`), and a **필터 초기화 / Reset** link clears them.

**Runtime role source is now `profiles.role`.** When Supabase is configured,
`getCurrentUser()` ([`src/lib/auth/session.ts`](src/lib/auth/session.ts)) verifies
the user with `supabase.auth.getUser()` and then reads the role from the
`profiles` table via [`src/lib/db/profiles.ts`](src/lib/db/profiles.ts). The
client-influenced `user_metadata.role` is **no longer trusted** for authorization.
A Supabase-authenticated user **without a profile row fails closed** (treated as
unauthenticated until the profile exists). Dev-auth (Supabase unconfigured,
non-production) is unchanged, as is the Slice 2 production fail-closed behavior.

Owner RLS policies also require the caller's current `employer`/`admin` profile
role. Removing an employer role therefore revokes private company/job/applicant
access even if the old company ownership row remains.

## Application submission (Slice 5)

Approved job details link to `/jobs/[id]/apply`. Authenticated seekers can submit
one optional cover note (maximum 1,000 characters); the server action rechecks
the runtime profile role and approved job status, while RLS and the unique
`(job_id, seeker_id)` constraint remain the final authorization and duplicate
gates. Employer/admin accounts are blocked. Without Supabase, public mock jobs
remain browsable but application writes are unavailable and are never mocked.

## Application dashboards (Slice 6)

Seekers can review their own submissions at `/dashboard/applications`, while
employers can review applications for jobs owned by their companies at
`/employer/applications`. Both reads use caller-bound database functions through
the authenticated Supabase session. Employer results expose only applicant
display name and email; profile RLS is not broadened and no service-role client
is used. Supabase-unconfigured environments show an unavailable state instead
of mock or misleading empty application histories.

> Admin application management and resume upload remain deferred. Application
> status actions are covered in Slice 10 below.

## Employer company setup and posting (Slice 7)

Employer accounts can create their first company, edit existing owned companies,
submit a job as `pending`, and review owned-job moderation states. Company
verification and the retained `jobs.boost` column remain trusted-only fields:
normal employers cannot set either through the UI, Server Actions, or direct
RLS-backed writes.
Supabase-unconfigured environments never simulate persistent company or job data.

> Slice 7 provides the minimum company setup and first pending job submission
> needed for MVP continuity. Broader posting enhancements, job editing, and
> admin moderation remain deferred; roadmap rebaselining is separate docs work.

## Admin moderation (Slice 8)

Admin accounts can review pending jobs at `/admin/jobs` and verify or unverify
companies at `/admin/companies`. Job decisions are enforced as pending-only
updates; approval sets the public posting timestamp, while rejection remains
non-public. Company actions update only the verification flag. These flows use
the caller's cookie-authenticated Supabase session and existing admin RLS; no
new migration or service-role client is required.

## Application messaging (Slice 9)

Seekers and owning employers can exchange messages inside an application thread
from their application dashboards. Thread reads and writes use the caller's
cookie-authenticated Supabase session; RLS limits access to the applicant,
owning employer, or an admin, while only seeker/employer participants may send.
Supabase-unconfigured environments show an unavailable state and never create
mock messages.

Development-only notification stubs emit non-PII events for application
submission, application-status changes, and new messages. No email provider,
credentials, or production delivery path is included.

## Application status workflow (Slice 10)

Employers can update application statuses from `/employer/applications` for
applications on jobs owned by their company. Seekers see the current status on
`/dashboard/applications`. The workflow uses the fixed status set `submitted`,
`reviewing`, `interview`, `offered`, `rejected`, and `withdrawn`; seeker-created
applications still start as `submitted`.

Status writes use the caller-authenticated Supabase session, never a
service-role client or mock persistence. The server action validates the status
and requires the exact employer runtime role, while RLS remains the final
ownership gate. Supabase-unconfigured environments show an unavailable state
instead of pretending to save status changes.

Real email notifications and broader notification preferences remain deferred.

## Verification trust and report queue (Slice 11)

Public job cards and job detail pages now show modest company verification
signals. Verified language means company information has been reviewed; it is
not a safety, legal, immigration, hiring, or job-quality guarantee from K-Work
US.

Approved job detail pages link to `/jobs/[id]/report`, where signed-in users can
report listings for discriminatory wording, visa-status preference, illegal cash
pay, misleading/suspicious content, spam, or other concerns. Report writes use
the caller-authenticated Supabase session and are unavailable when Supabase is
not configured; no persistent report writes are mocked.

Admins can review reports at `/admin/reports`, mark open reports as `reviewed`
or `dismissed`, and see an open-report count from `/admin`. Report queue reads
show the reported job, company, reason, note, reporter display name/email, and
status without exposing applicant, application, message, or broad profile data.

Blocking/sanctions, email alerts, and full trust-and-safety case management
remain deferred.

## Payments and boosts (Slice 12 — removed in Slice 23)

Payments and paid boosts were de-scoped from the MVP in Slice 23; the
`jobs.boost` column, enum, and write-protection triggers remain in the schema,
intentionally unused. Revisit post-beta.

Slice 12 originally added Stripe Checkout for `featured`/`urgent` job boosts
(boost page, checkout Server Action, and signature-verified webhook). All of
that code, its Stripe environment variables, and the boost UI were removed in
Slice 23; no Stripe account is needed to develop, deploy, or launch the MVP.

## Admin analytics and KPI dashboard (Slice 13)

Admins can open `/admin/analytics` from the admin console to review aggregate
marketplace health metrics: job moderation status totals, recent job activity,
application status totals, company verification totals, report status totals,
and message volume.

Analytics reads use the caller-authenticated Supabase session and existing admin
RLS. The page displays aggregate counts only; it does not select message bodies,
application notes, applicant private details, report details, or thread content.
Supabase-unconfigured environments show an unavailable state instead of fake
persistent analytics.

This slice does not add PostHog, Plausible, chart libraries, CSV export, cohort
retention, payment revenue tracking, or billing history analytics.

## Compliance polish (Slice 14)

K-Work US now uses shared informational compliance copy across job detail,
application, employer posting, report, and verification surfaces.
Employers must acknowledge responsibility for accurate job information and
applicable wage, labor, tax, and work-authorization laws before submitting a new
job; the server action rejects submissions that omit the acknowledgement.

Posting validation flags and blocks clearly risky language around
discrimination, nationality-only wording, visa/citizenship preferences,
off-the-books cash pay, unpaid training, tips-only compensation, and 1099-only
claims while still allowing job-related Korean language requirements. Admin job
moderation computes the same compliance flags for review context and explains
that a flag is not a legal determination; admins still approve or reject
manually.

Verification remains informational. Company review does not guarantee job
quality, safety, legal compliance, applicants, or hires. This slice is not
legal advice and is not a legal compliance engine.

## Deployment & launch hardening (Slice 15)

Launch documentation and hardening for the private beta:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + hosted Supabase
  deployment guide (env vars as placeholders, migration order, first-admin
  promotion, known issues).
- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) — go/no-go checklist:
  environment, seed-data verification, admin setup, RLS review, QA script
  (390px/1440px), monitoring, rollback notes.

SEO polish: `metadataBase` + Open Graph identity in the root layout,
`robots.ts`/`sitemap.ts` (static public pages only; account/auth areas
disallowed), descriptions on policy pages, canonical URLs for the jobs listing
and job detail, and `noindex` on the apply/report user flows.

Accessibility polish: explicit label association (`htmlFor`/`id`) on the job
filters, posting form, and dev auth form; `aria-live` on form error alerts;
`aria-describedby` on the application cover-note limit; a global
`:focus-visible` ring for keyboard users.

Smoke tests (`tests/smoke-public-pages.test.ts`, `tests/seo.test.ts`) render
every public page end-to-end on the deterministic mock path, assert guards fire
with correct redirect targets, non-approved job ids 404, and the sitemap/robots
expose no private routes. **Browser E2E (Playwright/Cypress) remains deferred**
— see the launch checklist. This slice adds no product features, schema
changes, or new dependencies.

## Production beta readiness (Slice 17)

Docs-and-verification-only slice — no product, schema, or CI changes:

- [`docs/BETA_READINESS.md`](docs/BETA_READINESS.md) — 16-section operator
  runbook for taking a deployment to private beta: verification order, exact
  queries, per-role smoke tests, and the go/no-go decision table.
- [`docs/PRODUCTION_ENV_VARS.md`](docs/PRODUCTION_ENV_VARS.md) — per-variable
  production environment reference (required/optional, client vs server-only
  exposure, validation and failure modes; placeholders only).
- `npm run verify:beta` — offline docs gate (`scripts/verify-beta-readiness.mjs`):
  required docs and CI workflow exist, launch-checklist topics intact,
  placeholder-only secret hygiene. No network, no credentials.

## Observability & operational health (Slice 18)

A zero-dependency operational health layer for the private beta — no paid
observability provider, no product changes:

- `GET /api/health` — public-safe liveness + configuration-presence endpoint
  for uptime checks. Always 200 JSON with coarse statuses only
  (`configured`/`partial`/`missing`/`deferred`) — never env values or secrets;
  no Supabase/network calls; works unauthenticated and in CI's
  unconfigured mode (`src/app/api/health/route.ts` → `src/lib/ops/health.ts`,
  contract asserted by `tests/health.test.ts`).
- [`docs/OPERATIONAL_HEALTH.md`](docs/OPERATIONAL_HEALTH.md) — operator
  runbook: health-endpoint reference, uptime monitoring, the fail-closed
  behavior map, log triage by symptom (Vercel/Supabase), and the
  private-beta incident response process.

## Social & phone auth foundation (Slice 19)

Real sign-in methods on `/login` and `/signup`, entirely through **Supabase
Auth** (no hand-rolled OAuth, no SMS SDKs, no new secrets):

- **KakaoTalk / Google / Naver buttons** driven by an allowlist registry
  (`src/lib/auth/providers.ts`): only known provider keys can ever reach
  `supabase.auth.signInWithOAuth`. Kakao and Google use built-in Supabase
  providers; **Naver goes through Supabase's custom OIDC provider support**
  (`custom:<slug>`) and ships **setup-required by default** until the
  dashboard registration is verified.
- **Phone OTP** (E.164 number → 6-digit SMS code) via
  `signInWithOtp({ phone })` / `verifyOtp({ phone, token, type: "sms" })`,
  with a 60-second resend cooldown. Codes are never stored; phone numbers and
  codes are never logged. Phone verification only confirms control of the
  number — no identity/work-authorization claims.
- Everything is gated behind **default-off public flags**
  (`NEXT_PUBLIC_AUTH_*` — booleans, not secrets); unconfigured methods render
  a calm "setup required" state. CI needs no provider credentials, and the
  dev role-picker still works unchanged in unconfigured local mode.
- The `?next=` return path is sanitized by a shared helper
  (`src/lib/auth/redirect.ts`) used by the OAuth callback, dev sign-in, and
  the OTP success redirect — same-site paths only (also hardened against
  backslash/control-character `//` bypasses).
- New accounts get their `profiles` row from the existing
  `on_auth_user_created` trigger (role `seeker`); authorization still reads
  `profiles.role` only. Real provider E2E needs a Supabase project with both
  the schema deployed (trigger + the `20260707…` explicit table grants) and
  that provider's credentials — setup guide:
  [`docs/AUTH_PROVIDERS.md`](docs/AUTH_PROVIDERS.md).

## Local Supabase (Slice 20)

The app picks its mode from the Supabase values in `.env.local`:

| Supabase env values | Mode |
| --- | --- |
| Placeholders from `.env.example` (the default) | **Dev mode** — cookie-based dev role-picker auth, deterministic mock job data, write flows render unavailable states. |
| Real **local** stack values (printed by `supabase start`) | **Real mode** — Supabase local Auth + Postgres: real sessions, seeded DB reads, RLS-guarded writes. |

[`docs/LOCAL_SUPABASE.md`](docs/LOCAL_SUPABASE.md) is the full guide:
prerequisites (Docker + Supabase CLI), `supabase start` + `supabase db reset`,
wiring the printed URL/keys into `.env.local`, the manual smoke checklist
(`/api/health`, `/jobs`, auth pages, employer/admin flows), common errors,
safe resets, and what must never be committed. It is also the recommended
rehearsal before any hosted setup
([`docs/BETA_READINESS.md`](docs/BETA_READINESS.md)).
`npm run verify:local-supabase` is the offline gate that keeps the guide,
the local stack inputs, and the placeholder hygiene intact.

## Production security headers (Slice 26)

Every response carries a baseline security-header policy, built by the pure
helper [`src/lib/security/headers.ts`](src/lib/security/headers.ts) and wired
through `async headers()` in [`next.config.ts`](next.config.ts):
`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a restrictive
`Permissions-Policy`. The CSP is `'self'`-based; the only external origins are
the Supabase HTTP(S)+WS(S) hosts derived from `NEXT_PUBLIC_SUPABASE_URL` for
`connect-src`. CSP and HSTS are **production-only** (a strict CSP fights
`next dev`'s React `eval`/HMR); development sends only the four always-safe
headers. Unit-tested by
[`tests/security-headers.test.ts`](tests/security-headers.test.ts).

The CSP also sets `script-src-attr 'none'` (blocks inline HTML event-handler
attributes such as `onclick`/`onerror`/`onload`, independent of the bootstrap
`'unsafe-inline'`) and `frame-src 'none'`. **`frame-src 'none'` is correct for
the current product** because the app uses no CAPTCHA iframe, payment widget,
embedded support widget, or other framed third-party content. A future
integration with **Supabase CAPTCHA, Cloudflare Turnstile, hCaptcha, reCAPTCHA,
a payment widget, or an embedded support/identity-verification tool** will
require a *reviewed* CSP change (typically `frame-src`, and possibly
`script-src`/`connect-src`). Do not loosen `frame-src`, `script-src`, or
`connect-src` preemptively.

This is **code-level** hardening: after deploy, confirm the headers on the live
domain (`curl -I`) per [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md)
§7. A strict **nonce-based** CSP (removing `script-src 'unsafe-inline'`) is
deliberately deferred — it would force every page into dynamic rendering — and
remains future hardening.

## Development approach

Work is delivered in small, reviewable **slices** (one PR each), Slice 0 → 15.
See the slice table in [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## Compliance

Current controls require pay ranges, show work-authorization disclaimers, require
employer posting acknowledgement, block clearly risky posting language, and show
admin review flags for moderation context. The platform provides **information
only** and does not give legal advice, determine work eligibility, or guarantee
legal compliance.
