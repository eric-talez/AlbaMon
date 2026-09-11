# K-Work US

California hiring marketplace with Korean-first UI and key English guidance.
Free for seekers and employers. Job-related language requirements are supported;
nationality/ethnicity restrictions are not.

The [California public-launch design](docs/superpowers/specs/2026-09-09-california-launch-design.md)
and [product brief](docs/PRODUCT_BRIEF.md) supersede the original PDF and historical
Slice roadmap. Public deployment is **UNVERIFIED** pending actual operator,
domain, provider, policy review and hosted execution evidence.

대표용 [출시 인수인계와 실제 배포 순서](docs/launch-evidence/production-release.md),
[첫 30일 운영표](docs/operations/first-30-days.md)를 먼저 확인하세요.
소프트웨어/로컬 검증은 완료됐지만 실제 공개는 아직 **NO-GO**입니다.

## Develop locally

Use Node **22.x** (`.nvmrc`), npm and the committed lockfile:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Only non-production development with placeholder Supabase settings uses the
local role picker and deterministic mocks. Production builds/runtimes never
publish samples or simulate persistent writes. Real local Supabase enables
Auth/Postgres/RLS; see [LOCAL_SUPABASE](docs/LOCAL_SUPABASE.md). The owned isolated
stack uses API55321/DB55322 and must not disturb original543xx/native5432.
After applying migrations to a fresh disposable stack, run
`npm run setup:local-policy` before browser journeys. It aligns the immutable
initial draft pointer with the current checked-in bundle, never user acceptance.

## Verify

```bash
npm test
npx next typegen
npm run typecheck
npm run lint
npm run verify:beta
npm run verify:local-supabase
npm run test:db
npm run build
npm run test:e2e
```

`verify:beta` is retained as an offline **California launch documentation** alias;
it is not a private-beta waiver or hosted readiness proof. DB/browser tests need
the isolated stack. `npm run check:production-artifact` builds and checks the
unconfigured production artifact without sample exposure. CI runs unit, offline,
local RLS, local provider-double and production browser checks.

## Current product and security

Public browse/search/detail, employer requests/company/posting lifecycle,
applications/status/terminal withdrawal, messages, reports, moderation/suspension,
policy acknowledgements and marketplace cohort signals are implemented. Server
session validation and current DB roles, RLS/RPC ownership, active+AAL2 admin,
CAS transitions and retained audits enforce authorization. Normal user flows never
use a service-role key. Resend outbox worker/signed webhook tools are implemented;
actual provider delivery and Production cron scheduling need independent evidence.
No payments, boosts, resume uploads or realtime chat in this launch.

## Deploy and operate

- [Deployment runbook](docs/DEPLOYMENT.md): separate Preview/staging and Production DB/origins, guarded migrations, OAuth/admin bootstrap and protected read-only smoke.
- [Environment variables](docs/PRODUCTION_ENV_VARS.md): current names, scope and secret handling.
- [Launch checklist](docs/LAUNCH_CHECKLIST.md) and [environment evidence](docs/launch-evidence/environments.md): actual versus local/synthetic gates.
- [Policy publication review](docs/legal/launch-policy-review.md) and [privacy operations](docs/operations/privacy-requests.md).
- [Operational health](docs/OPERATIONAL_HEALTH.md), [browser evidence](docs/launch-evidence/browser-qa.md) and [database reference](docs/DATABASE.md).

Vercel natively runs `npm run build:release`: real reviewed policy/settings,
isolated target mapping and bounded DB policy identity check before Next build.
Ordinary local build success is not release approval. Staging artifacts cannot be
relabeled as Production because public origins and indexing settings are compiled.
The historical [beta runbook](docs/BETA_READINESS.md) remains reference material;
current public launch checklist and deployment workflow govern.
