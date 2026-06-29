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
- Stripe Checkout for paid job boosts; planned: Resend/SendGrid

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

## Project structure

```
src/
  app/                 # App Router routes (public, auth, employer, admin)
  components/           # UI + auth components
  lib/
    auth/               # roles, permission matrix, server-side guards, sessions
    supabase/           # browser/server clients + proxy session helper
    db/                 # DB row types + approved-job reads (mock fallback)
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
enums, the seven core tables (`profiles`, `companies`, `jobs`, `applications`,
`messages`, `reports`, `audit_logs`), constraints, an `updated_at` trigger, authorization
helper functions, and **Row Level Security** on every table. See
[`docs/DATABASE.md`](docs/DATABASE.md) for the full schema + RLS summary and
[`supabase/README.md`](supabase/README.md) for how to apply migrations and seed.

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
verification and paid boosts remain trusted-only fields: normal employers cannot
set either through the UI, Server Actions, or direct RLS-backed writes.
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

## Payments and boosts (Slice 12)

Employers can open `/employer/jobs/[id]/boost` from the owned job dashboard and
choose `featured` or `urgent` for a job they own. Checkout creation is
server-side only, re-checks the authenticated employer/admin ownership path, and
stores job ID, company ID, boost type, and initiating user ID in Stripe Checkout
metadata. Creating a Checkout session never updates `jobs.boost`.

Stripe sends payment confirmations to `/api/stripe/webhook`. The webhook verifies
`STRIPE_WEBHOOK_SECRET` against the raw request body before trusting metadata,
then uses the service-role Supabase client only to update the intended job boost
after a paid `checkout.session.completed` event. Duplicate webhook deliveries are
safe because setting the same boost value is idempotent.

Public job cards and details show boost badges for boosted approved jobs only;
moderation still controls public visibility. Local/dev environments with
placeholder Supabase or Stripe variables show unavailable states instead of
pretending to purchase. Refunds, subscriptions, invoices, coupons, payouts,
taxes, billing portals, and analytics remain deferred.

## Admin analytics and KPI dashboard (Slice 13)

Admins can open `/admin/analytics` from the admin console to review aggregate
marketplace health metrics: job moderation status totals, recent job activity,
application status totals, company verification totals, report status totals,
message volume, and featured/urgent boost counts.

Analytics reads use the caller-authenticated Supabase session and existing admin
RLS. The page displays aggregate counts only; it does not select message bodies,
application notes, applicant private details, report details, or thread content.
Supabase-unconfigured environments show an unavailable state instead of fake
persistent analytics.

This slice does not add PostHog, Plausible, chart libraries, CSV export, cohort
retention, payment revenue tracking, or billing history analytics.

## Compliance polish (Slice 14)

K-Work US now uses shared informational compliance copy across job detail,
application, employer posting, report, boost, and verification surfaces.
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

Verification and boosts remain informational. Company review does not guarantee
job quality, safety, legal compliance, applicants, or hires, and boosts do not
imply endorsement or higher job quality. This slice is not legal advice and is
not a legal compliance engine.

## Development approach

Work is delivered in small, reviewable **slices** (one PR each), Slice 0 → 15.
See the slice table in [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## Compliance

Current controls require pay ranges, show work-authorization disclaimers, require
employer posting acknowledgement, block clearly risky posting language, and show
admin review flags for moderation context. The platform provides **information
only** and does not give legal advice, determine work eligibility, or guarantee
legal compliance.
