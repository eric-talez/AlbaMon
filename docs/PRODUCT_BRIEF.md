# K-Work US — Product Brief

> Source of truth: `docs/K-Work_US_Development_Plan.pdf` (Version 0.1). This file is
> a working summary for engineers. When in doubt, the PDF governs.

## What we are building

K-Work US is a **mobile-first, Korean-English bilingual local hiring marketplace**
for the U.S. Korean community. Initial market: **LA / Orange County**.

It is a lightweight "hiring OS": _post job → apply → message → interview → offer_,
managed in one place — not just a community bulletin board.

**Brand note:** The product name is **K-Work US**. We do **not** use legacy or
confusingly similar marketplace brand names anywhere in code or UI (trademark /
brand-confusion risk).

## Positioning (critical)

- Korean-**English bilingual** jobs and Korean/Asian-community-friendly local hiring.
- **NOT** "Korean-only" hiring. Language can be expressed as a **job-related
  requirement** (e.g. "Korean required for customer communication"), never as a
  nationality, ethnicity, citizenship, or immigration-status restriction.

## MVP scope (Must-have)

1. Public job board with filters (city, category, job type, pay, schedule, language).
2. Job detail page with pay range, schedule, location, and a work-authorization
   disclaimer.
3. One-click application for authenticated seekers.
4. Employer onboarding + company profile.
5. Employer job posting with compliance-first validation.
6. Employer dashboard + applicant management.
7. Admin moderation (approve/reject) with safety flags.
8. Reports/blocking, employer verification.
9. Stripe-based featured/urgent boosts.
10. Admin analytics/KPIs.

### Non-goals (MVP)

- Native iOS/Android apps (mobile web first).
- Payroll, background checks, placement success fees.
- Determining an individual's legal work eligibility (we provide general info and
  point students to their DSO only).
- Nationwide expansion before product-market fit.

## Compliance constraints (coded from day one)

| Risk | Product rule |
| --- | --- |
| National-origin discrimination | Block "Korean-only / 한국인만"; allow job-related language requirements. |
| Visa-status preference | Block "OPT only", "H-1B preferred", visa-status gating. |
| Illegal cash pay | Block "under the table", "cash only no tax", "세금 없이". |
| Pay opacity | `pay_min` / `pay_max` required on every job (CA pay transparency). |
| Student work confusion | Disclaimer: platform does not judge work authorization; consult DSO. |
| Privacy | Restrict resume/phone access; honor deletion requests (RLS + privacy settings). |

Standard disclaimers live in `lib/compliance` and on the job-detail / application flow.

## Recommended architecture

- **Frontend/Backend:** Next.js App Router + TypeScript + Tailwind (Server Actions / API routes).
- **DB/Auth/Storage:** Postgres via Supabase (Auth + RLS).
- **Payments:** Stripe Checkout. **Email:** Resend/SendGrid. **SMS (Phase 2):** Twilio.
- **Deploy:** Vercel + Supabase. **Analytics:** PostHog/Plausible or DB aggregation first.

## Roles

`seeker` · `employer` · `admin` — enforced with **server-side** checks (never
client-only) and Supabase RLS.

## Slice plan (one PR per slice)

| # | Slice | Done when |
| --- | --- | --- |
| 0 | Project baseline | App runs locally; lint/typecheck/test scripts exist. |
| 1 | Public shell | Home + jobs list/detail shell render on mobile + desktop (mock data). |
| 2 | Auth & roles | Role-protected routes work; server-side guards. |
| 3 | Database schema | Migrations + seed; only approved jobs are public. |
| 4 | Job browse/search | Filters/sort/pagination; pending jobs never public. |
| 5 | Job detail & apply | One application per seeker/job; duplicate blocked. |
| 6 | Application dashboards | Seekers see their own submissions; employers see applicants only for owned jobs. |
| 7 | Employer onboarding | Only employers create/edit company profile. |
| 8 | Post job | Compliance validation; new jobs pending, not public. |
| 9 | Admin moderation | Approve/reject; flagged keywords reach review queue. |
| 10 | Application status workflow | Employers update owned application status; seekers see status. |
| 11 | Verification trust and report queue | Verified badges; signed-in job reports; admin report queue. |
| 12 | Payments & boosts | Stripe checkout activates boost via webhook. |
| 13 | Analytics | Admin KPI dashboard. |
| 14 | Compliance polish | Policy pages, disclaimers, audit logs. |
| 15 | Launch hardening | QA, a11y, SEO, deploy checklist. |

## Current status

- **Slice 0 — Project baseline:** ✅ done.
- **Slice 1 — Public shell:** ✅ done (`/`, `/jobs`, `/jobs/[id]`; header,
  mobile bottom-nav, footer, job cards, and work-authorization disclaimer).
- **Slice 2 — Auth & roles:** ✅ done.
  - Supabase SSR clients (browser/server) + `proxy.ts` session refresh
    (Next 16 renamed `middleware` → `proxy`).
  - Roles `seeker` / `employer` / `admin`; central permission matrix in
    `lib/auth/access.ts`; **server-side** guards in `lib/auth/guards.ts`.
  - **Dev-auth fallback:** while Supabase env vars are placeholders, a
    cookie-based mock session lets you pick a role to exercise guards locally.
  - Configured runtime authorization reads `profiles.role`; `user_metadata.role`
    is not trusted. Email/password and OAuth initiation UI remain future work.
- **Slice 3 — Database schema & seed:** ✅ done.
  - Migrations are the source of truth: `supabase/migrations/` (enums, six core
    tables, constraints/indexes, `updated_at` trigger, auth helper functions) +
    `supabase/seed.sql` (3 fictional LA/OC companies, 8 approved + 1 pending +
    1 draft job). See [`DATABASE.md`](DATABASE.md).
  - **Row Level Security** on all tables: public reads only `approved` jobs;
    profile self-update cannot change role; employer job inserts are forced to
    `pending`; audit logs are admin-read / service-role-write only.
  - Slice 4.5 owner policies require the actor's current employer/admin role, so
    role demotion revokes private ownership-based access.
- **Slice 4 — Job browse/search:** ✅ scoped implementation done.
  - Server-rendered GET search supports keyword, city, category, job type,
    language, minimum pay, and newest/pay sorting with URL state.
  - Configured reads use an approved-only public view with safe company identity;
    local/test/build use deterministic approved-only mocks.
  - Original roadmap items still deferred: schedule filter, featured-first sort,
    pagination/load-more, expiry filtering, and a dedicated loading state.
- **Slice 5 — Job detail & apply:** scoped implementation done.
  - Approved job details link to a guarded application route.
  - Seekers may submit one optional 1,000-character cover note per job.
  - Employer/admin roles, unapproved jobs, duplicate writes, and missing profiles
    fail closed through server checks plus database RLS/constraints.
  - Supabase-unconfigured environments do not simulate application writes.
- **Slice 6 — Application dashboards:** scoped implementation done.
  - Seekers see only their own application history; employers see only
    applications for jobs under companies they own.
  - Caller-bound RPCs re-check runtime database roles and expose employers only
    applicant display names and emails without broadening profile RLS.
  - Unconfigured environments show an explicit unavailable state and never
    create mock application records.
  - Minimum employer setup continues in Slice 7 below.
- **Slice 7 — Minimum employer setup and pending job submission:** scoped
  implementation done.
  - Employers can create their first company, edit existing owned companies,
    submit jobs only as `pending`, and review owned-job statuses.
  - Server Actions derive ownership from the verified session and block explicit
    discriminatory, visa-preference, and illegal-cash wording.
  - Verification and boost fields reject employer writes while trusted
    admin/service-role workflows remain available.
  - This does not absorb the broader old Slice 8 roadmap item; roadmap
    rebaselining or downstream renumbering belongs in a separate docs-only PR.
- **Slice 8 — Admin job moderation and company verification:** scoped
  implementation done.
  - Exact-admin pages show pending-job and unverified-company queues.
  - Admins may approve or reject only currently pending jobs and may verify or
    unverify companies through caller-authenticated RLS-backed writes.
  - Approval sets the public posting timestamp; rejected jobs remain non-public.
  - No new migration, service-role client, rejection reason, or audit subsystem
    is introduced.
- **Slice 9 — Application messaging and notification stubs:** scoped
  implementation done.
  - Seekers and owning employers exchange bounded messages per application;
    admins retain read access through RLS but have no messaging UI.
  - Development-only, non-PII notification stubs cover application submission,
    status changes, and new messages without provider credentials.
  - Real email delivery and broad notification preferences remain deferred.
- **Slice 10 — Application Status Workflow:** scoped implementation done.
  - Employers can update application statuses for jobs owned by their company
    from `/employer/applications`; seekers see the current status on
    `/dashboard/applications`.
  - Supported statuses are `submitted`, `reviewing`, `interview`, `offered`,
    `rejected`, and `withdrawn`; seeker-created applications still start as
    `submitted`.
  - Status writes use the caller-authenticated Supabase session and a
    server-side employer guard, with RLS enforcing owned-job authorization.
  - Supabase-unconfigured environments show an unavailable state and never
    simulate persistent status writes.
  - Real email notifications, notification preferences, contracts, and payroll
    remain deferred.
- **Slice 11 — Verification Trust and Report Queue:** scoped implementation done.
  - Public job cards/details show careful company verification signals without
    implying safety, legal, immigration, hiring, or job-quality guarantees.
  - Signed-in users can report approved job listings for discriminatory wording,
    visa-status preference, illegal cash pay, misleading/suspicious content,
    spam, or other concerns.
  - Admins can review `/admin/reports`, mark open reports as reviewed or
    dismissed, and see an open-report count on `/admin`.
  - Report writes and admin queue reads use caller-authenticated Supabase
    sessions and RLS; no service-role client or mock persistent report writes
    are used.
  - Stripe, boosts, blocking/sanctions, email alerts, and full trust-and-safety
    case management remain deferred.
