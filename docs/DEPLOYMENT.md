# California public launch deployment

K-Work US is free for seekers and employers, with public workplaces restricted to
California. The [approved design](superpowers/specs/2026-09-09-california-launch-design.md)
and current migrations supersede the original PDF and historical Slice/private-beta notes.
Use Node **22.x** (`.nvmrc`), pinned lockfile, Supabase CLI **2.109.1** and Vercel CLI
**59.13.1** for the recorded procedure. No actual hosted deployment is verified;
see [environment evidence](launch-evidence/environments.md),
[environment variables](PRODUCTION_ENV_VARS.md), [launch checklist](LAUNCH_CHECKLIST.md)
and [local setup](LOCAL_SUPABASE.md).

The [Korean owner handover and production execution record](launch-evidence/production-release.md)
contains the exact candidate/migration identities, actual NO-GO gaps, staged
Production/promotion commands and residual findings. Its ordered D3 procedure is
the **only Production mutation path** for migrations, candidate creation and
promotion; the staging procedure below is not a Production shortcut. After real public Go use
the [first-30-days runbook](operations/first-30-days.md).

## Inventory before any hosted mutation

The operator must select actual existing Vercel/Supabase projects, domain,
provider accounts and support/operator facts. Inspect existing projects before
creating another or accepting new cost. CLI/browser access in this session was
unavailable; this does not prove no account or existing live data exists.

```bash
supabase projects list
npx --yes vercel@59.13.1 whoami
npx --yes vercel@59.13.1 project inspect "$VERCEL_PROJECT" --scope "$VERCEL_TEAM"
npx --yes vercel@59.13.1 env ls preview --scope "$VERCEL_TEAM"
npx --yes vercel@59.13.1 env ls production --scope "$VERCEL_TEAM"
```

Record actual project name/ref, region, plan, backup type/retention/latest point,
prior deploys, migration versions, safe business counts and known seed presence.
Run the read-only [existing-data inventory](launch-evidence/environments.md#existing-data-inventory)
before schema changes; keep identified rows in protected operator evidence.
Never copy production data into staging. Fixtures require fictional jobs and
owner-controlled test accounts. Hosted reset/seed is prohibited.

## Exact environment mapping

Vercel **Preview → staging Supabase**, **Production → production Supabase**.
Set the actual four non-secret values `STAGING_PROJECT_REF`,
`PRODUCTION_PROJECT_REF`, `STAGING_ORIGIN`, `PRODUCTION_ORIGIN` in both hosting
scopes and operator shells. Origins must be distinct public HTTPS origins,
without userinfo, path, query or fragment; optional root slash is normalized.
Refs must differ and match the selected Supabase URL exactly. The guard validates
shape and mapping; console evidence establishes actual project ownership.

`EMAIL_ENVIRONMENT` is the existing runtime environment setting. There is no
additional `DEPLOYMENT_ENV` toggle. Preview requires staging email and
`NEXT_PUBLIC_INDEXING_ENABLED=false`; Production requires production email and
indexing `true`. Google is `true` only following actual provider setup/test;
Kakao/Naver/Phone remain `false` until verified. Separate project keys, Resend
sender/API/webhook and cron secrets by environment. See the full variable table.

`vercel.json` sets the native **Build Command `npm run build:release`**, preserving
the notification cron. Inspect hosted overrides too. This command validates
reviewed policy/settings, exact target mapping and the bounded anonymous current
policy RPC before Next builds. Ordinary `npm run build` supports local artifact
regressions and cannot establish public readiness. `NEXT_PUBLIC_*` and headers
are compiled: any public-origin/indexing/provider/policy change requires a fresh
build. Never relabel a staging artifact as Production.

## Current migration inventory

The current source contains 25 migrations, in this exact filename order.
The checksum manifest is `docs/launch-evidence/migrations.sha256`; dated prior
execution reports retain the inventory that was actually tested then. New
upstream July files are historical relative to the September launch files, so
an existing September database must stop at a history mismatch. Do not rewrite
history, reset, seed or use `--include-all` as a hosted launch shortcut.

| Order | Migration |
| --- | --- |
| 1 | `20260621000000_init_schema.sql` |
| 2 | `20260622000000_audit_hardening.sql` |
| 3 | `20260623000000_application_submission.sql` |
| 4 | `20260624000000_application_listing_functions.sql` |
| 5 | `20260625000000_employer_write_hardening.sql` |
| 6 | `20260626000000_application_messages.sql` |
| 7 | `20260627000000_application_status_workflow.sql` |
| 8 | `20260628000000_report_queue_hardening.sql` |
| 9 | `20260706000000_employer_access_requests.sql` |
| 10 | `20260707000000_explicit_table_grants.sql` |
| 11 | `20260713000000_restrict_company_public_reads.sql` |
| 12 | `20260714000000_transactional_admin_audit_logs.sql` |
| 13 | `20260714010000_server_rate_limiting.sql` |
| 14 | `20260909000050_private_company_access.sql` |
| 15 | `20260909000100_profile_and_admin_security.sql` |
| 16 | `20260909000200_ca_job_search.sql` |
| 17 | `20260909000300_job_lifecycle.sql` |
| 18 | `20260909000400_application_lifecycle.sql` |
| 19 | `20260909000500_notification_outbox.sql` |
| 20 | `20260909000510_notification_claim_recovery.sql` |
| 21 | `20260909000600_abuse_controls.sql` |
| 22 | `20260909000700_policy_acknowledgements.sql` |
| 23 | `20260909000710_policy_publication_identity.sql` |
| 24 | `20260909000800_marketplace_signals.sql` |
| 25 | `20260911000000_main_launch_compatibility.sql` |

The final compatibility migration retires `moderate_pending_job`, retains
`transition_job` revision/reason checks, and makes existing September triggers
the sole audit writers for company/report/employer-access decisions. Active
AAL2/current-policy checks and transaction locks remain in the admin RPCs.
Replay all files in order on a fresh disposable local stack before relying on
this inventory. Existing local data requires a separately recorded, non-reset
upgrade rehearsal; see [local migration handling](LOCAL_SUPABASE.md#5-applying-migrations-and-seed).

## Staging migrations

Load only the selected environment's secrets through protected operator tooling;
do not put values in shell history or print `supabase status -o env`. Use the
repository root for hosted commands only after verifying the explicit link.
Record the approved full clean source SHA and actual staging ref as
`APPROVED_RELEASE_SHA` and `APPROVED_STAGING_PROJECT_REF`. Export `RECORD_DIR` as
a new protected absolute path outside the repository for this attempt; never reuse an earlier directory.
The subshell must stop on any guard, link, history or checksum failure.

```bash
(
set -euo pipefail
umask 077
: "${RECORD_DIR:?}" "${APPROVED_RELEASE_SHA:?}" "${APPROVED_STAGING_PROJECT_REF:?}"
mkdir -m 700 "$RECORD_DIR"
test "$(git rev-parse HEAD)" = "$APPROVED_RELEASE_SHA"
test -z "$(git status --porcelain)"
test "$STAGING_PROJECT_REF" = "$APPROVED_STAGING_PROJECT_REF"
npm run verify:deploy-target -- staging
supabase link --project-ref "$STAGING_PROJECT_REF"
test "$(cat supabase/.temp/project-ref)" = "$APPROVED_STAGING_PROJECT_REF"
supabase migration list --linked > "$RECORD_DIR/migrations-before.txt" 2>&1
shasum -a 256 -c docs/launch-evidence/migrations.sha256
supabase db push --dry-run > "$RECORD_DIR/dry-run.txt" 2>&1
shasum -a 256 docs/launch-evidence/migrations.sha256 "$RECORD_DIR/dry-run.txt"
)
```

Compare the **entire current ordered migration directory**, not a historic count,
with remote history and inspect the exact dry-run SQL. Stop on remote-only or
missing history, destructive changes or an unexpected target. Do not use normal
launch work to run migration repair, `--include-all`, `--db-url` or history edits.
After reviewing the actual staging target, backup, compatibility, before-history
and dry-run output/exit, record the approved source SHA/ref, manifest file hash,
dry-run file hash and reviewer/UTC. Export `APPROVED_MANIFEST_SHA256` and
`APPROVED_DRY_RUN_SHA256` from that reviewed receipt, **never by recalculating
approval from current files immediately before applying**. Keep the source,
target and evidence fixed during this execution window. Any change, including
another operator's DB change, requires fresh history/dry-run and review.

```bash
(
set -euo pipefail
umask 077
: "${RECORD_DIR:?}" "${APPROVED_RELEASE_SHA:?}" "${APPROVED_STAGING_PROJECT_REF:?}"
: "${APPROVED_MANIFEST_SHA256:?}" "${APPROVED_DRY_RUN_SHA256:?}"
npm run verify:deploy-target -- staging
test "$STAGING_PROJECT_REF" = "$APPROVED_STAGING_PROJECT_REF"
test "$(cat supabase/.temp/project-ref)" = "$APPROVED_STAGING_PROJECT_REF"
test "$(git rev-parse HEAD)" = "$APPROVED_RELEASE_SHA"
test -z "$(git status --porcelain)"
test "$(shasum -a 256 docs/launch-evidence/migrations.sha256 | cut -d ' ' -f 1)" = "$APPROVED_MANIFEST_SHA256"
test "$(shasum -a 256 "$RECORD_DIR/dry-run.txt" | cut -d ' ' -f 1)" = "$APPROVED_DRY_RUN_SHA256"
shasum -a 256 -c docs/launch-evidence/migrations.sha256
supabase db push > "$RECORD_DIR/push.txt" 2>&1
supabase migration list --linked > "$RECORD_DIR/migrations-after.txt" 2>&1
)
```

Never add `--include-seed`. New migrations remain additive; do not modify old
migrations to make changed policy facts or old data fit. Production requires the
separately approved [D3 existing-data, backup and guarded migration procedure](launch-evidence/production-release.md#2-production-additive-migration-d32).
Do not adapt these staging commands or reuse its receipt/link for Production.

## OAuth, Preview protection and read-only smoke

Set Supabase Site URL to the exact staging origin; redirect allowlist includes
exact `STAGING_ORIGIN/auth/callback`. Avoid wildcard Vercel hosts. Google's
approved JavaScript origin is the app origin; its authorized redirect URI is the
**Supabase Google-provider callback displayed in that project's dashboard**.
The app callback is still `/auth/callback`. Repeat independently for Production.

Enable Vercel deployment protection for Preview. Confirm an unauthenticated
visitor cannot access it, then grant named testers access. For automated smoke,
the owner may provide a scoped Vercel protection automation bypass secret through
the protected environment as `VERCEL_AUTOMATION_BYPASS_SECRET`. Smoke sends it
only as `x-vercel-protection-bypass` to the one explicitly selected request
origin, refuses redirects, and prints neither secret nor bodies. Do not disable
protection to pass smoke. Protection denial is a failed/inaccessible smoke, not
an application failure diagnosis or a pass. Document both anonymous denial and
approved-access success separately.

Ensure an existing project and explicit Preview selection before deploying: a
new project's first CLI deployment can select Production. Use the Dashboard's
explicit Preview flow for the first deployment if necessary. Inspect the actual
deployment environment/build command and record its immutable URL/commit.

```bash
npx --yes vercel@59.13.1 inspect "$PREVIEW_URL" --scope "$VERCEL_TEAM"
DEPLOYMENT_ORIGIN="$PREVIEW_URL" npm run smoke:deployment -- staging
DEPLOYMENT_ORIGIN="$STAGING_ORIGIN" npm run smoke:deployment -- staging
```

`NEXT_PUBLIC_SITE_URL` must equal the artifact's compiled staging canonical
origin. A **staged Production** artifact is fetched at its unique Vercel URL
while retaining the future Production canonical domain. Use only the ordered
[D3 Production creation, identity and protection procedure](launch-evidence/production-release.md#3-새-production-build와-staged-url-d33),
then its smoke and public Go/promotion steps. It requires approved clean source,
actual linked org/project identity, release metadata, generated-URL Protection
and cron/provider containment **before candidate creation**. `--skip-domain`
alone supplies none of these controls. The former direct Production deploy
recipe is retired; do not deploy from this general smoke section.

Do not substitute the request URL into `NEXT_PUBLIC_SITE_URL` or rebuild with it.
Promotion/domain assignment is a separately reviewed public launch action after
all checklist gates. Re-run smoke on the canonical domain after promotion.

Smoke uses GET liveness/readiness, public jobs/canonical, robots/sitemap, sample
404, and **missing/wrong** worker authentication only. It checks operational email
configuration, not inbox delivery. **Valid-auth GET `/api/internal/notifications`
claims rows and sends mail.** It and signed suppression webhooks are explicitly
mutating provider tests requiring separate owner-controlled mailbox authorization;
they are never dry-run/read-only smoke steps. Do not run them in this session.

Preview does **not** receive Vercel's platform cron: that scheduler targets the
project's Production deployment. The one-minute entry in `vercel.json` proves
only configured scheduling intent. Actual plan support/frequency, invocations,
leases and delivery remain to verify. A manually authorized staging worker test
does not prove scheduled operation. The selected one-project mapping strictly
requires Vercel Preview → staging and Vercel Production → production, even when
a copied staging configuration is internally consistent. A separate staging
Vercel project is unselected and unsupported by this gate; using that topology
would require an explicit verified project decision and a project-bound mapping
extension before deployment, not a different email setting or a bypass switch.
[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) documents the Production target.

## Policy publication and founding administrator

Complete the [reviewed bundle and CAS activation workflow](legal/launch-policy-review.md).
Keep historical 00710's draft seed immutable. Archive every activated facts/prose
bundle, identity, immutable artifact, review reference and change-notice decision.
Read the actual current pointer before the transition; the service-only
`activate_policy_publication(expected_identity,next_identity)` must use that
captured expected value. Never refresh it automatically on conflict. Re-read
with bounded anonymous RPC and run the release build against the matching
reviewed identity. Activation writes audit evidence, never user/job acceptance.
Until coordinated activation/deployment, policy writes may fail closed; retain
history and audit dependencies. A code rollback should use a compatible artifact
with the **same current identity**, not silently reactivate older terms.

For a fresh local/CI stack only, after migrations run `npm run setup:local-policy`.
It requires API55321/DB55322, holds keys in memory, and advances only the immutable
initial draft via CAS to the checked-in current bundle (or no-ops if equal).
It refuses an already transitioned different pointer. That case needs the explicit
reviewed transition procedure; never reset a populated database just to align it.
CI runs this before database/browser tests, so real reviewed facts do not require
historical migration edits or replacing user acknowledgement history.

Founding admin requires actual Google login first, creating a **seeker** profile.
The representative independently confirms that exact UUID through trusted Auth
and profile records. In the intended project's protected SQL editor, perform a
transaction whose condition is the verified UUID and active seeker role:

```sql
begin;
update public.profiles set role = 'admin'
where id = '<owner-verified-user-uuid>'::uuid
  and role = 'seeker' and account_status = 'active'
returning id, role, account_status;
-- Commit only if exactly the independently verified account was returned.
commit;
```

Record the operator/change approval in restricted evidence. Do not add role form
fields or trust `user_metadata`. Sign in again, explicitly acknowledge current
policies, enroll and verify TOTP at `/account/security`; prove AAL1 denial
and successful active+AAL2 admin review. Retain recovery procedures securely.
All actual founding-admin/OAuth/MFA executions remain UNVERIFIED.

## Verification, recovery and evidence

```bash
npm run setup:local-policy
npm test
npm run typecheck
npm run lint
npm run verify:beta
npm run verify:local-supabase
npm run check:production-artifact
npm run test:e2e:dev
```

`test:e2e:dev` uses `playwright.dev.config.ts` and development-only fixtures;
`test:e2e` separately exercises the production build with real local Auth/DB.
Neither establishes hosted Google, inbox delivery or physical-device evidence.
Production security headers and Preview noindex are compiled together; inspect
actual response headers and client hydration after deployment. The optional OTP
HMAC secret is not required while phone sign-in remains disabled in production.

CI owns its disposable stack lifecycle; original543xx/native5432 are untouched.
D2's completed local database/browser/fault/restore results and their measured
timing are in [candidate evidence](launch-evidence/release-candidate.md); actual
hosted execution remains unverified.
For a hosted recovery target, `npm run verify:deploy-target -- recovery` requires
additional `RECOVERY_PROJECT_REF`/`RECOVERY_ORIGIN` distinct from **both** other
targets, with matching public site and Supabase URL. It is identity preflight
only; recovery is never accepted by `build:release`. Never restore over production.
Verify Auth, RLS/grants, evidence retention and settings that backups do not carry.
During an incident, check worker configuration, active cron and queue leases:
[Instant Rollback does not update active cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

For each actual action record UTC, exact SHA, target/ref/request+canonical origins,
command, result and non-secret evidence link. Local/synthetic PASS does not imply
actual legal review, hosted access, OAuth, email, DNS, physical-device QA, restore
or public-release approval. Missing actual gates remain **UNVERIFIED**.
