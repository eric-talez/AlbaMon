# California public launch checklist

Use the [approved design](superpowers/specs/2026-09-09-california-launch-design.md),
[deployment runbook](DEPLOYMENT.md), [local Supabase guide](LOCAL_SUPABASE.md) and
[environment evidence](launch-evidence/environments.md). Historical private-beta
exceptions do not authorize public launch. Every checked gate needs UTC, exact
commit, actual target/ref/origins, action/result and non-secret evidence reference.

Current result: **public NO-GO**. The [Korean owner handover and production record](launch-evidence/production-release.md)
separate completed local software evidence from these unexecuted real release gates.
Use [first 30 days](operations/first-30-days.md) only after an actual public T0.

## 1. Environment variables and ownership

- [ ] Actual operator/support/domain, Vercel and two Supabase projects selected; existing resources inspected before creating/billing anything.
- [ ] `NEXT_PUBLIC_SUPABASE_URL`/keys correctly scoped; staging and production refs/origins differ; `verify:deploy-target` passes for the actual target.
- [ ] Native `npm run build:release` effective in Vercel; Preview staging indexing=false, Production indexing=true; `EMAIL_ENVIRONMENT` matches target.
- [ ] Preview protection denies anonymous access, approved smoke access succeeds without disabling protection; staging HTML noindex and robots disallow `/` verified.
- [ ] Google OAuth origin/Supabase callback/app `/auth/callback` independently verified in each environment; other flags false until verified.

## 2. Migrations and existing data

- [ ] Actual remote history compared with **all current** `supabase/migrations/*.sql`; expected `supabase db push --dry-run` reviewed before plain `supabase db push`.
- [ ] No hosted reset, seed, production-to-staging copy, forced history repair or destructive migration.
- [ ] CA/pay/city and missing-expiry/ambiguous-publication inventories reviewed with real owner/source evidence; no invented publication dates.

## 3. Seed/demo-data verification

- [ ] No mock IDs, known seeded UUIDs/companies or `employer%@example.com` fixtures are public; actual controlled fixture cleanup checked.
- [ ] Production unconfigured build/runtime never publishes mock jobs. Safe read-only smoke and production artifact checks pass.

## 4. Admin setup

- [ ] Real seeker login creates a profile; representative confirms exact UUID; trusted SQL `role = 'admin'` promotion recorded.
- [ ] TOTP enrollment/recovery procedure, AAL1 denial, active+AAL2 review success and current-policy acknowledgements verified.

## 5. RLS and full journeys

- [ ] Final candidate unit/type/lint/offline, live RLS/RPC/CAS matrix and browser tests pass with exact counts and retained evidence.
- [ ] 390px/1440px and required physical devices, keyboard/assistive interaction, session/callback/expiry, owner/job/app/message/report/suspension journeys and real performance measured.
- [ ] Cookie-free sitemap public predicate, real publication/expiry/location, request-origin versus canonical-origin and no production noindex verified.

## 6. Policy publication and operations

- [ ] Real facts/prose reviewed, effective/change-notice process approved, support tested, exact bundle digest and immutable policy archive retained.
- [ ] Service-controlled current policy pointer activated with captured expected identity; anonymous bounded read matches the release artifact; prior acceptance/audit/history preserved.
- [ ] Stale account/job identities require explicit reacknowledgement; no bulk acceptance or historical seed rewrite.
- [ ] Hosted privacy workflow and retention/deletion/backup holds reviewed and rehearsed; no local fixture results counted as legal review.

## 7. Notifications and readiness

- [ ] `/api/health` coarse configuration and `/api/ready` actual public DB read are healthy; readiness outage behavior verified.
- [ ] Resend sender/DNS, authorized controlled inbox/spam, signed suppression webhook, retry/idempotency/lease recovery and queue/log privacy verified.
- [ ] **Valid-auth GET worker and signed webhook tests explicitly authorized as mutating.** Read-only smoke invokes neither.
- [ ] Actual Production Vercel cron/plan/frequency verified; Preview has no platform cron merely because a schedule exists.

## 8. Rollback, restore and public promotion

- [ ] D2 fault/restore drill records actual backup coverage, recoverable point, RPO ≤24h and measured RTO ≤4h; Auth/settings/RLS and audit dependencies preserved. Local 114.070s restore and 1,003ms artifact switch do not prove hosted objectives.
- [ ] Compatible immutable code rollback uses same current reviewed policy identity; no silent older-policy activation or assumption that Instant Rollback changes active cron.
- [ ] Staged Production URL smoke expects the future Production canonical; domain promotion only after all actual external gates pass.
- [ ] Any missing fact, access, review or execution remains **UNVERIFIED / NO-GO**. Synthetic configuration PASS and local production-shaped builds are software evidence only.
