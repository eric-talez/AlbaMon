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
- [ ] `EMAIL_PROVIDER=dev` confirmed (real email delivery is out of beta scope)
- [ ] PostHog vars left empty (analytics provider not initialized in this build)
- [ ] `NEXT_PUBLIC_AUTH_*` flags decided per provider — keep the default
      `false` for any method whose Supabase dashboard setup is not verified
      (see [`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md) and §12)
- [ ] `npm test` passes — includes `tests/security.test.ts`, which scans tracked
      files for secret-shaped strings and forbidden brand names

## 2. Supabase setup & migrations

- [ ] Local Supabase rehearsal completed ([`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md)):
      migrations + seed + auth mode + admin promotion verified against a
      disposable local stack **before** touching the hosted project
- [ ] Hosted project created; region appropriate for LA/OC
- [ ] All 10 migrations applied **in filename order** via `supabase db push`
      (order table in [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project)),
      after `supabase login` + `supabase link --project-ref <project-ref>`
- [ ] **Never `supabase db reset` against the hosted project** — it wipes the
      database; `db push` is the only hosted schema command (`reset` is for
      the disposable local stack). And never apply `supabase/seed.sql` to
      production (§3)
- [ ] Post-migration smoke completed per
      [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project): `/api/health`
      shows Supabase `configured` → first sign-up gets `profiles.role =
      'seeker'` → founding admin promoted via SQL (§4) → `/admin` shows live
      queue counts → auth flags flipped only after per-provider smoke (§12)
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
- [ ] Verified: `/admin` shows live queue counts (jobs, companies, employer
      access requests, reports). Live counts need real Supabase — a dev-auth
      admin previews the UI only and sees the "Admin setup required" panel
- [ ] Documented who holds admin (beta: keep it to 1–2 people)

**Employer access (Slice 21):** employers need no SQL. New users start as
`seeker` and request employer access at `/employer/request-access`; the admin
approves or rejects at `/admin/employer-requests`. Approval switches the
profile role to `employer` (company creation still happens afterwards through
the employer flow); rejection changes nothing; self-promotion stays blocked.
Approval is an operational gate only — it is not business, legal, or
work-authorization verification.

- [ ] Verified: a seeker's request appears in `/admin/employer-requests`, and
      approving it opens `/employer` for that account

## 5. Payments (de-scoped in Slice 23)

Payments and paid boosts were de-scoped from the MVP in Slice 23; the
`jobs.boost` column, enum, and write-protection triggers remain in the schema,
intentionally unused. Revisit post-beta. No Stripe account, keys, webhook, or
test transaction is required to launch — this section is intentionally empty.

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
      (disclaimers on job detail, apply, posting, verification surfaces;
      covered by `tests/jobs.test.ts` and `tests/smoke-public-pages.test.ts`)

## 7. RLS / security review

RLS is the authorization gate; the anon key is safe to expose **only** because
of it. Since `20260707000000_explicit_table_grants.sql`, table-level privileges
for the API roles are **explicit** (current Supabase applies no implicit
grants); RLS remains the row gate on top
([`DATABASE.md`](DATABASE.md#table-grants-supabase-api-roles)). Static tests
assert the policy files; live-DB verification needs the Supabase CLI + Docker
(see `supabase/README.md`).

| Area | Migration | Static test |
|---|---|---|
| Base schema, RLS enabled on all tables | `20260621…_init_schema.sql` | `tests/db-schema.test.ts` |
| Approved-only public view, role revocation | `20260622…_audit_hardening.sql` | `tests/db-schema.test.ts`, `tests/auth-role-source.test.ts` |
| Seeker-only application inserts | `20260623…_application_submission.sql` | `tests/application-flow.test.ts`, `tests/db-applications.test.ts` |
| Caller-bound dashboard RPCs | `20260624…_application_listing_functions.sql` | `tests/db-applications.test.ts` |
| Verification/boost write guards (boost column retained but unused since Slice 23) | `20260625…_employer_write_hardening.sql` | `tests/db-companies.test.ts`, `tests/db-employer-jobs.test.ts` |
| Participant-bound messages | `20260626…_application_messages.sql` | `tests/messaging-routes-security.test.ts`, `tests/db-messages.test.ts` |
| Status workflow constraints | `20260627…_application_status_workflow.sql` | `tests/application-status-migration.test.ts` |
| Report queue constraints | `20260628…_report_queue_hardening.sql` | `tests/report-workflow-migration.test.ts`, `tests/db-reports.test.ts` |
| Seeker→employer request queue + review RPC | `20260706…_employer_access_requests.sql` | `tests/db-employer-access-requests.test.ts`, `tests/employer-access-migration.test.ts` |
| Explicit API-role table grants (fail-closed sign-in fix) | `20260707…_explicit_table_grants.sql` | `tests/db-schema.test.ts` |

- [ ] Role guards remain server-side (`src/lib/auth/guards.ts`; every
      `/admin`, `/employer`, `/dashboard` page calls them — no client-only gating)
- [ ] No app code path uses the service-role client (`src/lib/supabase/service.ts`
      is retained infrastructure; the health check only reports the key's presence)
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
- [ ] `/admin` operational-health card shows the same checks and links
      `/api/health` — treat `/api/health` as the first setup check whenever
      admin queues look wrong
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
| RLS spot-checks passed (§7) | ☐ |
| Team accepts open placeholders: attorney review pending, no error tracking, dev-stub email, browser E2E deferred | ☐ |
| Social/phone auth providers verified per §12 — or their flags stay `false` | ☐ |

**Go** = every row checked. Any unchecked row = **no-go**; fix or explicitly
accept (with a name and date) before inviting users.

## 12. Social & phone auth providers

Config-time checklist for enabling real sign-in methods; not a beta blocker —
every method ships behind a default-`false` flag and renders as
"setup required" until this section is done for it. Full setup steps:
[`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md).

- [ ] Supabase Auth → URL Configuration: Site URL set, and the redirect
      allowlist includes the **wildcard** `https://<your-domain>/auth/callback*`
      (the OAuth `redirectTo` can carry `?next=…`)
- [ ] Kakao: Kakao Developers app configured with the Supabase callback URL;
      provider enabled in Supabase; live sign-in smoke-tested → then
      `NEXT_PUBLIC_AUTH_KAKAO_ENABLED=true`
- [ ] Google: GCP OAuth client configured; provider enabled in Supabase; live
      sign-in smoke-tested → then `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`
- [ ] Naver (go/no-go): Supabase **custom OIDC provider** registered and
      verified end-to-end in staging — if Naver's OIDC support cannot satisfy
      it, keep the flag `false` (button stays setup-required) → otherwise set
      `NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID=<slug>` and
      `NEXT_PUBLIC_AUTH_NAVER_ENABLED=true`
- [ ] Phone OTP: Supabase Phone provider + SMS vendor connected **in the
      Supabase dashboard only** (no SMS credentials in Vercel/repo/CI); send +
      verify tested with a real number; rate limits reviewed → then
      `NEXT_PUBLIC_AUTH_PHONE_ENABLED=true`
- [ ] First social/phone sign-up spot-checked: `profiles` row auto-created
      with role `seeker`; flags flipped only after the matching dashboard
      setup was verified

## Deferred (accepted for beta, revisit after)

- Payments and paid boosts were de-scoped from the MVP in Slice 23; the
  `jobs.boost` column, enum, and write-protection triggers remain in the
  schema, intentionally unused. Revisit post-beta.
- Attorney-reviewed legal copy (placeholder pages ship with review notice)
- Real email/SMS delivery (dev stub only)
- Error tracking & product analytics providers
- Browser E2E automation (Playwright/Cypress)
- Per-job URLs in the sitemap (build-time sitemap would go stale; jobs are
  crawlable via `/jobs`)
- Open Graph/social preview image (text metadata only)
- `lang="en"` spans on inline English copy and a skip-to-content link
  (accessibility polish beyond the beta bar)
