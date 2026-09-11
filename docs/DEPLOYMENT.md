# California public launch deployment

K-Work US is free for seekers and employers, with public workplaces restricted to
California. The [approved design](superpowers/specs/2026-09-09-california-launch-design.md)
and current migrations supersede the original PDF and historical Slice/private-beta notes.
Use Node **22.x** (`.nvmrc`), pinned lockfile, Supabase CLI **2.109.1** and Vercel CLI
**59.13.1** for the recorded procedure. No actual hosted deployment is verified;
see [environment evidence](launch-evidence/environments.md),
[environment variables](PRODUCTION_ENV_VARS.md), [launch checklist](LAUNCH_CHECKLIST.md)
and [local setup](LOCAL_SUPABASE.md).

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

## Staging migrations

Load only the selected environment's secrets through protected operator tooling;
do not put values in shell history or print `supabase status -o env`. Use the
repository root for hosted commands only after verifying the explicit link.

```bash
test -n "$STAGING_PROJECT_REF"
npm run verify:deploy-target -- staging
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase migration list --linked
supabase db push --dry-run
```

Compare the **entire current ordered migration directory**, not a historic count,
with remote history and inspect the exact dry-run SQL. Stop on remote-only or
missing history, destructive changes or an unexpected target. Do not use normal
launch work to run migration repair, `--include-all`, `--db-url` or history edits.
After reviewing the actual staging target and additive compatibility:

```bash
npm run verify:deploy-target -- staging
test "$(cat supabase/.temp/project-ref)" = "$STAGING_PROJECT_REF"
supabase db push
supabase migration list --linked
```

Never add `--include-seed`. New migrations remain additive; do not modify old
migrations to make changed policy facts or old data fit. Production later uses
its separately reviewed link/dry-run/push with `PRODUCTION_PROJECT_REF` and
`npm run verify:deploy-target -- production` immediately before the operation.
Do not reuse the staging link for a production push.

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
while retaining the future Production canonical domain:

```bash
npm run verify:deploy-target -- production
npx --yes vercel@59.13.1 deploy --prod --skip-domain --scope "$VERCEL_TEAM"
# Capture and inspect that actual deployment URL as STAGED_PRODUCTION_URL.
DEPLOYMENT_ORIGIN="$STAGED_PRODUCTION_URL" npm run smoke:deployment -- production
```

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
does not prove scheduled operation. A separately selected staging Vercel project
could use Production deployments with `EMAIL_ENVIRONMENT=staging`, isolated
staging DB/origin, indexing=false and protection; its creation/cost is unselected.
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
```

CI owns its disposable stack lifecycle; original543xx/native5432 are untouched.
D2 owns final database/browser/fault/restore rehearsals and their measured timing.
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
