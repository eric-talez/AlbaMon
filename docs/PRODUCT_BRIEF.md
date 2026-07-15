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
9. Stripe-based featured/urgent boosts. *(De-scoped from the MVP in Slice 23.)*
10. Admin analytics/KPIs.

### Non-goals (MVP)

- Payments and paid job boosts: de-scoped in Slice 23. The `jobs.boost` column,
  enum, and write-protection triggers remain in the schema, intentionally
  unused. Revisit post-beta.
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

Standard disclaimers live in `src/components/WorkAuthorizationDisclaimer.tsx`
and on job detail, application, and employer posting flows.

## Recommended architecture

- **Frontend/Backend:** Next.js App Router + TypeScript + Tailwind (Server Actions / API routes).
- **DB/Auth/Storage:** Postgres via Supabase (Auth + RLS).
- **Payments:** none in the MVP (de-scoped in Slice 23). **Email:** Resend/SendGrid. **SMS (Phase 2):** Twilio.
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
| 12 | Payments & boosts | Stripe checkout activates boost via webhook. *(Removed in Slice 23.)* |
| 13 | Analytics | Admin KPI dashboard. |
| 14 | Compliance polish | Disclaimers, posting acknowledgement, risky-language validation, admin flags. |
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
  - Migrations are the source of truth in `supabase/migrations/`. The schema now
    spans **eight core business tables** (`profiles`, `companies`, `jobs`,
    `applications`, `messages`, `reports`, `employer_access_requests`,
    `audit_logs`) plus the private operational `rate_limit_buckets` counter,
    alongside enums, constraints/indexes, an `updated_at` trigger, and auth
    helper functions; `supabase/seed.sql` seeds 3 fictional LA/OC companies
    (8 approved + 1 pending + 1 draft job). See [`DATABASE.md`](DATABASE.md).
  - **Row Level Security** on all tables: public reads only `approved` jobs;
    profile self-update cannot change role; employer job inserts are forced to
    `pending`; audit logs are admin-read only and, since Slice 27, written by
    the admin-only SECURITY DEFINER review functions (never by clients).
  - Slice 4.5 owner policies require the actor's current employer/admin role, so
    role demotion revokes private ownership-based access.
- **Slice 4 — Job browse/search:** ✅ scoped implementation done.
  - Server-rendered GET search supports keyword, city, category, job type,
    language, minimum pay, and newest/pay sorting with URL state.
  - Configured reads use an approved-only public view with safe company identity;
    local/test/build use deterministic approved-only mocks.
  - Original roadmap items still deferred: schedule filter, featured-first sort,
    pagination/load-more, and a dedicated loading state. (Expiry filtering
    shipped in Slice 31.)
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
  - Blocking/sanctions, email alerts, and full trust-and-safety case management
    remain deferred.
- **Slice 12 — Payments and Boosts:** implemented, then **removed in Slice 23**.
  - Originally shipped Stripe Checkout for `featured`/`urgent` boosts (boost
    page, server-side checkout creation, signature-verified webhook at
    `/api/stripe/webhook`, boost badges on public cards/details).
  - Payments and paid boosts were de-scoped from the MVP in Slice 23; the
    `jobs.boost` column, enum, and write-protection triggers remain in the
    schema, intentionally unused. Revisit post-beta.
- **Slice 13 — Admin Analytics and KPI Dashboard:** scoped implementation done.
  - Admins can open `/admin/analytics` from `/admin` to review aggregate
    marketplace KPIs for jobs, applications, companies, reports, and messages.
  - Reads use the caller-authenticated Supabase session with existing admin RLS
    and expose counts only, not message bodies, applicant details, application
    notes, report details, or thread content.
  - Job status, application status, report status, recent activity, and company
    verification counts are included (boost counts were removed in Slice 23).
  - External analytics providers, chart libraries, CSV export, and cohort
    retention remain deferred.
- **Slice 14 — Compliance Polish:** scoped implementation done.
  - Shared informational disclaimers now cover work authorization, wage/tax
    classification, employer-provided job details, reports, and company
    verification without presenting legal advice or legal determinations.
  - Employer job posting requires a compliance acknowledgement before server-side
    submission; the acknowledgement is validated but not stored.
  - Risky-language validation blocks clear discrimination, nationality-only,
    visa/citizenship-only, off-the-books cash pay, unpaid training, tips-only,
    and 1099-only phrases while allowing job-related Korean language skills.
  - Admin job moderation computes compliance review flags with category and
    reason text. Flags are review aids only and do not auto-approve or
    auto-reject jobs.
  - No schema, RLS, service-role, legal review, E-Verify, tax/payroll, sanctions,
    email delivery, or automated enforcement workflow is added.
- **Slice 15 — Launch hardening:** done. QA smoke tests, SEO/a11y polish, and the
  deploy checklist ([`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md)).
- **Slice 16 — CI and release gate:** done. GitHub Actions runs typecheck → lint →
  test → build on every push ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml)).
- **Slice 17 — Production beta readiness:** done. The pre-launch runbook
  ([`BETA_READINESS.md`](BETA_READINESS.md)) and the offline `verify:beta` docs gate.
- **Slice 18 — Observability & operational health:** done. `GET /api/health`
  presence-only status report plus the incident runbook
  ([`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md)); no network/DB probing.
- **Slice 19 — Social & phone auth foundation:** done. Google/Kakao/Naver OIDC and
  phone-OTP wiring behind `NEXT_PUBLIC_AUTH_*` flags
  ([`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md)); real credentials live only in Supabase.
- **Slice 20 — Local Supabase readiness:** done. Disposable local-stack guide plus
  the `verify:local-supabase` gate ([`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md)).
- **Slice 21 — Employer access requests:** scoped implementation done.
  - Real auth users always start as `seeker`. A signed-in seeker requests
    employer access at `/employer/request-access` (business/contact/location
    details plus an optional reason); signed-out visitors are redirected to
    `/login?next=/employer/request-access`.
  - Employer-area entry routes seekers to the request flow instead of a
    dead-end forbidden page; employers and admins are unaffected, and
    employer/admin accounts see an "already has employer access" state instead
    of the form.
  - Admins review the queue at `/admin/employer-requests` (pending first,
    newest first, with a pending count on `/admin`). Approval promotes the
    requester to `employer` atomically through an admin-only SECURITY DEFINER
    function; rejection records the decision without changing any role. Users
    cannot self-promote, and one pending request is allowed per account.
  - The form and status pages state that admin review is required before
    posting jobs, that approval is not guaranteed, and that K-Work US does not
    verify or guarantee business registration, legal status, or work
    authorization.
  - Approval does not create a company; company registration, job submission,
    approved-only public visibility, payments, and auth providers are
    unchanged. The user-facing flow never uses the service-role client.
- **Slice 22 — Admin operations console:** scoped implementation done.
  - `/admin` is a real operations dashboard: per-queue count cards (pending
    jobs, unverified companies, open reports, employer access requests) that
    resolve independently with ok / zero / unavailable / error states, so one
    failing queue degrades one card instead of hiding the console.
  - Always-visible admin navigation (jobs, companies, employer requests,
    reports, analytics, health check) plus an operational-health card that
    reuses the public `/api/health` presence report — statuses only, never
    env values.
  - With placeholder Supabase values, the dashboard shows an "Admin setup
    required" panel with the local-setup commands and env-variable **names**
    from [`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md); dev-auth admin previews
    the UI only, live counts need a configured Supabase.
  - Read-only recent-activity section on `audit_logs` (admin-read RLS,
    narrow select, latest 5); at the time nothing wrote the table, so its
    calm empty state was expected. Audit writes arrived in Slice 27 and now
    populate this section.
  - No schema/RLS changes, no service-role reads, and payments, auth
    providers, and public job visibility are unchanged.
- **Slice 23 — De-scope payments:** done.
  - Removed all Stripe/payment/boost functionality from the MVP: the boost
    page and checkout Server Action, the `/api/stripe/webhook` route, the
    payments helpers, Stripe env vars, the `stripe` health check, boost badges
    and CTAs, and boost analytics.
  - No schema change: the `jobs.boost` column, `boost_type` enum, boost-is-null
    insert policy, and `prevent_job_boost_change` trigger remain, intentionally
    unused. Public job visibility, auth, RLS, admin moderation, reports, and
    employer access behavior are unchanged.
- **Fix — explicit table grants (PR #25):** done.
  - Current Supabase projects apply no implicit table privileges to the API
    roles, so every real sign-in (social or phone OTP) minted a session and
    then failed closed at the `profiles.role` lookup (`permission denied for
    table profiles`, 42501), bouncing back to `/login`.
    `20260707000000_explicit_table_grants.sql` adds deterministic,
    least-privilege grants for `anon`/`authenticated`/`service_role`; RLS is
    unchanged as the row-level gate. Pinned by `tests/db-schema.test.ts`
    ([`DATABASE.md`](DATABASE.md#table-grants-supabase-api-roles)).
- **Slice 24 — Post-grants readiness docs:** done (docs-only).
  - Runbooks updated for the hosted schema deploy: `supabase login` →
    `supabase link` → `supabase db push` (all migrations in filename order — see
    [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project)), never
    `db reset` or `seed.sql` against hosted/production, and a post-migration smoke
    (health → first `seeker` signup → admin via SQL → `/admin` live counts →
    auth flags last) in [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project).
  - Where auth stands: the Slice 19 foundation (buttons, flags, callback,
    registry) is code-complete and fully rehearsable on the local stack, but
    real Google/Kakao/Phone E2E needs a Supabase project with **both** the
    schema deployed (profiles trigger + explicit grants) **and** that
    provider's credentials — the hosted project needs its migrations pushed
    before provider E2E can complete. Naver stays setup-required pending
    custom-OIDC verification; local phone test OTP and hosted SMS remain
    separate flows; payments/boosts stay de-scoped (Slice 23).
- **Slice 25 — Restrict company base-table reads:** done. Dropped the public
  verified-company read policy and revoked the `anon` SELECT on `companies`, so
  company identity is public only through the `public_job_listings` view
  (`20260713000000_restrict_company_public_reads.sql`).
- **Slice 26 — Production security headers:** done. Production-only CSP, HSTS, and
  hardening headers (including `script-src-attr 'none'`) via `next.config` plus a
  pure, unit-tested helper.
- **Slice 27 — Transactional admin audit logs:** scoped implementation done.
  - Every admin moderation decision — job approve/reject, company
    verify/unverify, report review/dismiss, employer-access approve/reject —
    now runs through an admin-only SECURITY DEFINER function
    (`20260714000000_transactional_admin_audit_logs.sql`) that applies the
    entity change and inserts exactly one `audit_logs` row in the same
    transaction. Actor identity is always `auth.uid()` inside Postgres;
    conflicts, validation failures, and unauthorized calls write nothing.
  - Stable action taxonomy (`job.approved`, `job.rejected`,
    `company.verified`, `company.unverified`, `report.reviewed`,
    `report.dismissed`, `employer_access.approved`,
    `employer_access.rejected`) with minimal structured metadata — statuses,
    booleans, and ids only; no emails, phones, addresses, or free text.
  - Audit rows are append-only for ordinary API roles: no new policies or
    table grants, and a guard trigger backstops UPDATE/DELETE for
    `anon`/`authenticated` even under grant drift; trusted maintenance (owner,
    `service_role`, FK cascades) passes. Job approval timestamps `posted_at`
    in Postgres (`now()`), replacing the app-minted timestamp.
  - The admin dashboard's recent-activity section now shows these decisions
    with Korean-first labels. Rejection reasons, audit search/export, and
    account deletion remain out of scope
    ([`DATABASE.md`](DATABASE.md#admin-audit-trail-slice-27)).
- **Slice 28 — Durable server-side rate limiting:** scoped implementation done.
  - A private `rate_limit_buckets` counter plus an atomic, `service_role`-only
    `consume_rate_limit` RPC (`20260714010000_server_rate_limiting.sql`) back a
    fixed-window limiter over phone-OTP send/verify and the high-risk
    authenticated writes (applications, reports, messages, employer-access
    requests, job/company creation).
  - Subjects (phone / IP / user) are HMAC-hashed with the server-only
    `RATE_LIMIT_HMAC_SECRET` (64 hex → 32 bytes) before they reach the DB, so raw
    identifiers are never stored. Missing/invalid config makes the protected
    actions **fail closed** in production/preview (allow-open only in dev/test).
  - This is the **only** app consumer of the service-role client; it calls
    `consume_rate_limit` and nothing else — never OTP send/verify, never a
    business mutation. `/api/health` adds a coarse `rateLimit` presence check.
- **Slice 29 — Operational readiness reconciliation:** docs + gates only.
  - Reconciled post-Slice-28 drift: a coarse `rateLimit` presence signal on
    `/api/health`, strengthened `verify:beta` / `verify:local-supabase` to catch
    missing rate-limit env, undocumented migrations, and stale service-role
    "no consumer" claims, and synchronized the migration count (13),
    service-role, and `RATE_LIMIT_HMAC_SECRET` documentation across the operator
    docs.
  - Adds no migration, provider, product feature, or broader service-role
    authority; the service-role client's sole consumer remains the Slice 28
    limiter's `consume_rate_limit` call.
- **Slice 30 — Core browser E2E (Playwright, Chromium):** tests only.
  - Hermetic dev-auth browser coverage under `next dev` with placeholder
    Supabase (deterministic mock jobs, no DB): the public shell + client
    hydration, job-discovery filters and URL query state, the dev-auth
    role-guard matrix (seeker/employer/admin, forbidden/redirect + safe `next`,
    logout), responsive desktop/390px navigation, and `/api/health`. A separate
    CI job runs `npm run test:e2e` after the unit/build gate and installs only
    pinned Chromium — no credentials, network services, or database.
  - Scope is the credential-free surface only. Real Supabase persistence,
    OAuth/SMS provider callbacks, Safari, responsive *visual* review, and
    keyboard/VoiceOver stay manually verified. Adds no migration, provider,
    product feature, or broader service-role authority.
- **Slice 31 — Expired job visibility & application cutoff:** scoped
  implementation done.
  - Job expiration is now a complete, database-backed public-visibility
    invariant. A job is publicly active only while `moderation_status =
    'approved' and (expires_at is null or expires_at > now())`; the
    `20260715000000_expired_job_visibility.sql` migration applies that identical
    predicate to the `jobs_select_public_approved` policy, the
    `public_job_listings` view, and the `applications_insert_seeker` policy.
  - An expired approved job drops off public lists/search, 404s on the public
    detail route, is unreadable through the public/anon jobs policy, and rejects
    new seeker applications (including direct PostgREST/RLS writes) — while
    staying `approved` and fully manageable in employer/admin history.
    `moderation_status` is never mutated on expiry; owner/admin policies are
    untouched. The mock layer mirrors the rule via a pure, clock-injectable
    `isJobPubliclyActive` helper, with fixed-date fixtures (null, far-future,
    past, and malformed expiry) so tests never depend on the current date.
  - No cron job, background task, service-role consumer, index, schedule filter,
    pagination, job editing, or automatic status transition is added; expiry is
    a read-time time comparison, not a status transition.
