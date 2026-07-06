# Launch Checklist — K-Work US private beta

Working go/no-go checklist for the first small private beta (LA/OC). Step-by-step
setup instructions live in [`DEPLOYMENT.md`](DEPLOYMENT.md); this file is the
list of things that must be **true** before inviting users. No real secrets
belong in this file — every value is a placeholder.

Companion docs: [`BETA_READINESS.md`](BETA_READINESS.md) is the step-by-step
runbook for verifying each gate below,
[`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md) is the per-variable
environment reference, and [`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md) is
the post-deploy health-check and incident runbook. `npm run verify:beta`
checks this documentation set automatically.

Legend: `[ ]` open · `[x]` done · items marked **(placeholder)** are known-open
work that beta launch explicitly accepts or defers.

## 1. Environment variables

All values set in Vercel (Production scope), none committed to the repo. The
placeholder-detection in the app treats `.env.example` values as *unconfigured*,
and production **fails closed** if Supabase credentials are missing.
Per-variable reference (exposure, validation, placeholders):
[`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md).

- [ ] `NEXT_PUBLIC_SITE_URL` = `https://<your-domain>` (canonical/OG/sitemap base)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (real project, not placeholders)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as **server-only** (never `NEXT_PUBLIC_*`)
- [ ] `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live mode on Production only)
- [ ] `STRIPE_WEBHOOK_SECRET` for the **live** endpoint
- [ ] `STRIPE_FEATURED_PRICE_ID`, `STRIPE_URGENT_PRICE_ID` (live price ids)
- [ ] `EMAIL_PROVIDER=dev` confirmed (real email delivery is out of beta scope)
- [ ] PostHog vars left empty (analytics provider not initialized in this build)
- [ ] `npm test` passes — includes `tests/security.test.ts`, which scans tracked
      files for secret-shaped strings and forbidden brand names

## 2. Supabase setup & migrations

- [ ] Hosted project created; region appropriate for LA/OC
- [ ] All 8 migrations applied **in filename order** via `supabase db push`
      (order table in [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project))
- [ ] Auth URL configuration: Site URL + `/auth/callback` redirect
- [ ] Email confirmations setting reviewed (Supabase Auth → Providers → Email)
- [ ] Database backups enabled (daily is fine for beta); note the restore path

## 3. Seed / demo data

`supabase/seed.sql` is **demo data only**: fictional employers with a shared
password and fixed UUIDs. It must never be applied to production.

- [ ] Verify production contains no seed rows (all three counts must be 0):

  ```sql
  select count(*) from auth.users        where email like 'employer%@example.com';
  select count(*) from public.companies  where id::text like 'aaaaaaaa-%';
  select count(*) from public.jobs       where id::text like 'bbbbbbbb-%';
  ```

- [ ] If seed data was applied by mistake **before real users exist**, reset the
      database and re-run migrations. After real data exists, delete narrowly in
      dependency order (jobs → companies → the three `employer%@example.com`
      auth users) and re-run the counts above.

## 4. Admin setup

There is intentionally no self-serve admin path (role self-update is blocked by
a DB trigger + RLS).

- [ ] Founding admin signed up through the normal flow
- [ ] Promoted via SQL editor: `update public.profiles set role = 'admin' where id = '<auth-user-uuid>';`
- [ ] Verified: that account can open `/admin`, and a fresh non-admin account
      gets `/forbidden`
- [ ] Documented who holds admin (beta: keep it to 1–2 people)

## 5. Stripe (test → live)

- [ ] Test-mode end-to-end pass: boost checkout → Stripe test payment →
      webhook `checkout.session.completed` → boost visible on the job
- [ ] Webhook signature verification confirmed (bad-signature request gets 4xx;
      covered by `tests/stripe-webhook.test.ts`)
- [ ] Live products/prices created; live price ids in env
- [ ] Live webhook endpoint registered → `https://<your-domain>/api/stripe/webhook`
      with its own `whsec_...` in Production env
- [ ] Live keys **only** on Production; Preview keeps test keys
- [ ] One real low-value live transaction verified after launch, then refunded

## 6. Legal & compliance copy **(placeholder — attorney review pending)**

The in-app copy (work-authorization disclaimer, posting policy, terms, privacy)
is **informational only and has not been reviewed by an attorney**. Policy pages
currently render "Coming soon" placeholders stating that final text follows
legal review.

- [ ] Attorney review of Terms of Service **(placeholder — not done)**
- [ ] Attorney review of Privacy Policy **(placeholder — not done)**
- [ ] Attorney review of posting policy & compliance disclaimers **(placeholder — not done)**
- [ ] Until then: beta invite communication states the service is a beta and
      policies are being finalized
- [ ] Verified the app itself makes no legal determinations or guarantees
      (disclaimers on job detail, apply, posting, boost, verification surfaces;
      covered by `tests/jobs.test.ts` and `tests/smoke-public-pages.test.ts`)

## 7. RLS / security review

RLS is the authorization gate; the anon key is safe to expose **only** because
of it. Static tests assert the policy files; live-DB verification needs the
Supabase CLI + Docker (see `supabase/README.md`).

| Area | Migration | Static test |
|---|---|---|
| Base schema, RLS enabled on all tables | `20260621…_init_schema.sql` | `tests/db-schema.test.ts` |
| Approved-only public view, role revocation | `20260622…_audit_hardening.sql` | `tests/db-schema.test.ts`, `tests/auth-role-source.test.ts` |
| Seeker-only application inserts | `20260623…_application_submission.sql` | `tests/application-flow.test.ts`, `tests/db-applications.test.ts` |
| Caller-bound dashboard RPCs | `20260624…_application_listing_functions.sql` | `tests/db-applications.test.ts` |
| Verification/boost write guards | `20260625…_employer_write_hardening.sql` | `tests/db-companies.test.ts`, `tests/db-employer-jobs.test.ts` |
| Participant-bound messages | `20260626…_application_messages.sql` | `tests/messaging-routes-security.test.ts`, `tests/db-messages.test.ts` |
| Status workflow constraints | `20260627…_application_status_workflow.sql` | `tests/application-status-migration.test.ts` |
| Report queue constraints | `20260628…_report_queue_hardening.sql` | `tests/report-workflow-migration.test.ts`, `tests/db-reports.test.ts` |

- [ ] Role guards remain server-side (`src/lib/auth/guards.ts`; every
      `/admin`, `/employer`, `/dashboard` page calls them — no client-only gating)
- [ ] Service-role client used **only** in the verified Stripe webhook path
      (`src/lib/supabase/service.ts` → `src/lib/payments/boosts.ts`)
- [ ] Public job surfaces read approved listings only (`public_job_listings`
      view; `tests/smoke-public-pages.test.ts` asserts non-approved ids 404)
- [ ] Sitemap/robots expose no private routes and no per-job URLs
      (`tests/seo.test.ts`)
- [ ] Spot-check in prod: signed-out user cannot fetch `/admin`, `/employer`,
      `/dashboard` (redirects), and a pending job's URL 404s

## 8. Monitoring & operations

Current state: **no error-tracking or analytics provider is wired** (PostHog env
vars exist but are not initialized). Beta operates on platform logs plus the
public `GET /api/health` endpoint. Operating procedures (health-check
reference, log triage, incident response) live in
[`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md).

- [ ] `GET /api/health` on production returns 200; required checks
      `configured`, deferred ones `deferred` — no `missing`/`partial`
      ([`OPERATIONAL_HEALTH.md §1`](OPERATIONAL_HEALTH.md#1-quick-health-check))
- [ ] External uptime monitor pointed at `/api/health` (alert on non-200;
      [`OPERATIONAL_HEALTH.md §3`](OPERATIONAL_HEALTH.md#3-uptime-monitoring))
- [ ] Vercel function logs reviewed after first deploy (no recurring errors;
      log-prefix guide in
      [`OPERATIONAL_HEALTH.md §5`](OPERATIONAL_HEALTH.md#5-log-triage--where-to-look-when-a-flow-fails))
- [ ] Supabase logs/dashboard reviewed (auth + Postgres errors)
- [ ] Stripe webhook dashboard shows deliveries succeeding (200s)
- [ ] Decide post-beta: error tracking (e.g. Sentry) and product analytics —
      **deferred, out of beta scope**
      ([`OPERATIONAL_HEALTH.md §7`](OPERATIONAL_HEALTH.md#7-deferred-observability-post-beta))
- [ ] On-call answer for the beta: who checks logs, and how users report
      problems (email/Kakao channel), documented for the team

## 9. Rollback notes

- **App**: Vercel → Deployments → promote the previous production deployment
  (instant, stateless app — safe at any time).
- **Database**: migrations are forward-only; there are no down-migrations.
  Take a backup/PITR snapshot **before** applying new migrations to prod.
  Restoring a backup rolls back *data* too — prefer fixing forward for
  code-level issues.
- **Stripe**: to freeze payments quickly, disable the live webhook endpoint
  and/or archive the boost prices; the boost page fails closed when checkout is
  unconfigured.

## 10. QA & verification

Automated (all must pass on the release commit):

- [ ] `git diff --check` (no whitespace/conflict markers)
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (unit + server-render smoke tests; 39 files)
- [ ] `npm run build`
- [ ] `npm run verify:beta` (readiness docs gate: required docs + CI workflow
      present, checklist topics intact, placeholder-only secret hygiene)

> **Browser E2E is deferred.** There is no Playwright/Cypress setup; automated
> coverage is Vitest server-render smoke tests (`tests/smoke-public-pages.test.ts`)
> plus action/DB-layer tests. The manual script below covers real-browser flows.

Manual smoke script — run at **390px (mobile)** and **1440px (desktop)**, in
Chrome + Safari, on the production URL:

- [ ] `/` renders; disclaimer visible; keyboard Tab shows focus rings
- [ ] `/jobs` browse + filter (keyword, city, pay); reset works without JS errors
- [ ] Job detail: pay range, schedule, disclaimers, apply/report buttons
- [ ] Apply signed-out → redirected to `/login?next=…`; after sign-in returns to apply
- [ ] Seeker: submit application; duplicate re-submit shows the duplicate state
- [ ] Employer: create company → post job (compliance acknowledgement required;
      risky phrasing blocked) → job **not** publicly visible while pending
- [ ] Admin: approve the job → appears on `/jobs`; reject path shows correctly
- [ ] Report a job → visible in admin report queue → review/dismiss
- [ ] Boost checkout (test mode on preview): pay → webhook → badge on listing
- [ ] Messaging: seeker ↔ employer thread on an application; status updates
      (reviewing/interview/offered) reflect on the seeker dashboard
- [ ] `/robots.txt` and `/sitemap.xml` respond; sitemap lists only public pages
- [ ] Forms usable with keyboard only; labels announce correctly (VoiceOver spot-check)

## 11. Go / no-go

| Gate | Status |
|---|---|
| All §10 automated checks green on the release commit | ☐ |
| Manual smoke script passed at 390px & 1440px | ☐ |
| No seed/demo data in production (§3 counts are 0) | ☐ |
| Founding admin verified (§4) | ☐ |
| Stripe live webhook verified (§5) | ☐ |
| RLS spot-checks passed (§7) | ☐ |
| Team accepts open placeholders: attorney review pending, no error tracking, dev-stub email, browser E2E deferred | ☐ |

**Go** = every row checked. Any unchecked row = **no-go**; fix or explicitly
accept (with a name and date) before inviting users.

## Deferred (accepted for beta, revisit after)

- Attorney-reviewed legal copy (placeholder pages ship with review notice)
- Real email/SMS delivery (dev stub only)
- Error tracking & product analytics providers
- Browser E2E automation (Playwright/Cypress)
- Per-job URLs in the sitemap (build-time sitemap would go stale; jobs are
  crawlable via `/jobs`)
- Open Graph/social preview image (text metadata only)
- `lang="en"` spans on inline English copy and a skip-to-content link
  (accessibility polish beyond the beta bar)
