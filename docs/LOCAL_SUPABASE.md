# Local Supabase — California launch rehearsal

This guide uses real local Auth/Postgres/RLS in the isolated
`albalmon-ca-launch` project. It does not authorize hosted access, provider sends
or changes to another local database. [Database reference](DATABASE.md),
[Supabase directory](../supabase/README.md), [deployment](DEPLOYMENT.md),
[auth providers](AUTH_PROVIDERS.md) and [operational health](OPERATIONAL_HEALTH.md)
provide the related boundaries. The [old beta guide](BETA_READINESS.md) is superseded.

## 1. Auth modes

Development with placeholder Supabase values uses a role picker and deterministic
fictional jobs. Development with a real local URL/anon key uses verified local
Auth and Postgres. Production builds and runtime never expose the role picker or
sample fallback. A successful development shell test does not prove real auth,
persistence, RLS or provider configuration.

## 2. Prerequisites

Use Node **22.x** (`.nvmrc`), npm with the lockfile, Docker and Supabase CLI
**2.109.1**, the version recorded by the launch rehearsal. Check versions before
starting; an unrelated CLI upgrade is not required for this work.

```bash
brew install supabase/tap/supabase
supabase --version
```

The Homebrew command installs the available CLI; verify it against the recorded
version before relying on rehearsal instructions. Do not upgrade/recreate an
existing database merely to match a guide.

## 3. Repository setup

```bash
npm ci
cp .env.example .env.local
```

Keep `.env.local` private and untracked. To run the credential-free browser suite,
use `npm run test:e2e:dev`. Its `playwright.dev.config.ts` starts a separate
`next dev` server with explicit placeholders and local fixtures. The real local
production browser suite is `npm run test:e2e`, with different configuration and
requirements described below.

## 4. Starting the local stack

Inspect `supabase/config.toml`, project identity, retained volumes and port
ownership before starting:

```bash
supabase start
```

The tracked stack uses API **55321**, DB **55322**, Studio **55323** and local
mail/analytics ports 55324–55327. Original 543xx and native 5432 services are outside
this guide. If a port is occupied, identify its owner; do not stop another
project to make this one start.

Starting an existing owned stack resumes its retained data. CLI startup/status
may reveal local keys; capture them only through protected local tooling and
never paste the output into a task, log, document or commit. Values are still
secrets even though they target loopback.

### Selecting the recovery stack

The public job-flow recovery uses the separately named `albamon-job-flow`
workspace at `~/.codex/local-stacks/albamon-job-flow`. It has the complete 26
migrations and current fictional seed. Its API is **56321**, DB is **56322** and
Studio is **56323**; companion services use 56324–56327. Configure the app with
the API URL on 56321. Studio on 56323 is an operator UI and is not a Supabase API
endpoint.

The recovered stack has all 26 migrations applied and 13 fictional jobs. Its
anonymous public listing view returns the 11 approved, unexpired rows; the
verified seed result included `bbbbbbbb-0000-0000-0000-000000000006`. All 11
public rows have expiry values. These checks used the API and anon key from this
same stack.

The retained `k-work-us` 543xx stack still has 14 migrations, ten jobs and null
expiry values. The retained `albalmon-ca-launch` 553xx stack is also unchanged.
Neither stack was reset or upgraded during recovery. Start the recovery source
without taking ownership of those retained stacks:

```bash
supabase start --workdir "$HOME/.codex/local-stacks/albamon-job-flow"
```

That private workspace disables Analytics in its local config because the
optional Docker port binding conflicts with another local service; public job
reads do not depend on it. The CLI `--exclude` flag did not bypass the Analytics
binding during the verified recovery startup, so use the command above.
After startup, pair the 56321 URL with the anon key reported for that same stack
in the private app environment, then restart the app from the recovery worktree:

```bash
cd /Users/rinny/IdeaProjects/AlbaMon/.worktrees/restore-job-flow
npm run dev
```

Never pair a URL from one local project with a key from another, and do not paste
generated keys into this guide.

## 5. Applying migrations and seed

Only a newly created, explicitly disposable stack may use:

```bash
supabase db reset --local
npm run setup:local-policy
```

Reset destroys that stack's data, replays every migration in filename order,
then applies the local seed. The [current inventory](DEPLOYMENT.md#current-migration-inventory)
contains all history; prior dated execution reports retain their older counts.
The seed contains three fictional employers/companies and 13 jobs: 11 approved,
one pending, one draft. Those are local fixtures, never hosted launch content.

**Existing September database:** incoming July migrations precede its applied
history. Stop at a mismatch and preserve the volume. For the new July15 expiry
migration, do not use the prior local `--include-all` procedure: its historical
view cannot replace the later launch view without dropping added columns.
Preserve the owned 553xx snapshot unchanged. Rehearse the full ordered history and
the actual upstream-main-to-launch upgrade on separately identified disposable
databases. Do not reset or seed the populated stack, drop the view as a bridge,
rewrite migration files or mark missing versions as applied. A future supported
upgrade path needs its own verified migration design before touching that data.

`setup:local-policy` accepts only API 55321/DB 55322. It advances the immutable
initial draft pointer via CAS to the checked-in bundle, or no-ops when equal.
It refuses a different already-transitioned pointer, which needs the explicit
[publication procedure](legal/launch-policy-review.md). It never acknowledges
policies for a user/job; do not rewrite historical 00710 or reset populated data
to align a pointer. Separately identified replay databases require their own
reviewed fixture setup rather than bypassing this target check.

## 6. Protected environment values

Use the selected local URL and generated keys in `.env.local` or a protected
process environment, without printing them:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
```

Auth/public reads need URL plus anon key. The service-role key supports trusted
notification tests and operations, never ordinary business mutations. The
optional `RATE_LIMIT_HMAC_SECRET` may remain the shipped placeholder while
phone auth is disabled. A local OTP limiter exercise needs a private random
32-byte value encoded as 64 hex characters; never commit its value. Database
business quotas do not depend on that optional secret.

<a id="appendix-b--optional-local-googlekakao-oauth-callback-config"></a>

## 7. Running the app

```bash
npm run dev
```

Open `http://localhost:3000`. Restart after changing public environment values.
Keep one browser host throughout an auth flow; mixing localhost and 127.0.0.1
can lose the PKCE verifier cookie. The tracked Auth redirect allowlist supports
the local development origins and production-test callback on 127.0.0.1:3100.
Real Google credentials and hosted provider configuration remain separate work.

## 8. Health and readiness

Check `http://localhost:3000/api/health` for coarse configuration statuses and
`http://localhost:3000/api/ready` for the bounded anonymous DB read. Health is
always 200 when the process responds and does not contact Supabase; readiness
must return 200/ready for a functioning public DB connection. Missing optional
mail/phone configuration is not proof of a failed local public-read path.
Neither endpoint proves login, mail receipt, RLS correctness or reviewed policies.

<a id="appendix-a--optional-real-sign-in-via-local-phone-test-otp"></a>

## 9. Login and signup

Open `http://localhost:3000/login` and `/signup`. With configured Supabase, the
dev role picker disappears. Google shows setup-required until enabled; disabled
Kakao/Naver/Phone methods remain hidden for this launch. No production phone
provider is enabled by installing the private limiter or its server actions.

The production browser suite creates controlled local Auth sessions through its
fixture helpers and removes the test data. It needs neither real Google nor SMS
credentials. If separately rehearsing phone OTP in development, use only a
throwaway local stack and local-only provider/test-OTP config. Never commit that
config or enable test codes on a hosted project. Keep production phone disabled.

## 10. Public job reads

`http://localhost:3000/jobs` reads the safe public listing view when configured.
The current fresh seed provides 11 approved local jobs. Pending/draft/closed,
expired, non-California and suspended-owner listings must be absent, and private
company contact fields must not be public. Check the actual stored dates and
history when a populated stack differs from the fresh seed; an empty list is
not permission to reset it.

The recovered 56321 source returned ready/200 at `/api/ready`, 11 cards at
`/jobs`, one Irvine filter match and the expected empty-search message. Browser
navigation matched list and detail headings for every one of the 11 seed UUIDs;
a missing canonical UUID returned 404, and signed-out Apply redirected through
login. This verifies anonymous public reads and navigation, not OAuth, phone
authentication or provider delivery.

## 11. Employer journey

Signed-out `/employer/company` and `/employer/jobs/new` redirect through login.
A real new user begins as seeker, explicitly acknowledges current policies,
requests employer access and awaits an active AAL2 admin decision. Approval
promotes the role transactionally; the employer then creates a company and
submits California pay/location and posting acknowledgements for review. Jobs
remain pending until approved; database quotas and policy checks apply even to
direct API attempts. These user writes never use service-role credentials.

## 12. Verifying admin promotion

For a controlled local test user, independently confirm the exact Auth/profile
UUID before using trusted SQL to set `role = 'admin'`. The operator workflow is
in [deployment](DEPLOYMENT.md#policy-publication-and-founding-administrator).
A role change alone is insufficient: acknowledge current policies, enroll and
verify TOTP at `/account/security`, prove AAL1 denial and active+AAL2 access.
Review a pending job with its current revision and check one lifecycle audit
entry; company/report/employer-access decisions also commit one audit event.

## 13. Verification commands

With the owned local stack configured and the current policy bundle prepared:

```bash
npm run test:db
npm run test:notifications:local
npm run build
npm run test:e2e
npm run test:e2e:dev
```

`test:e2e` requires the real local Supabase URL/anon key and starts `next start`
on 127.0.0.1:3100. It verifies real local Auth/DB journeys, with sensitive browser
artifacts disabled. The independent `test:e2e:dev` fixture suite proves only the
development shell; do not substitute it for the real production suite. Actual
physical devices, hosted OAuth and provider delivery remain separately unverified.

## 14. Resetting and stopping safely

`supabase stop --project-id albalmon-ca-launch` stops only the owned stack and
retains its backup volumes for later startup. Do not add `--no-backup` when
preserving work. `supabase db reset --local` is destructive and belongs only to
an explicitly disposable fresh-replay check. Never reset existing history,
acknowledgements or Auth to make a test green.

## 15. Local Supabase vs hosted Supabase

Local fixtures and generated loopback credentials stay local. Hosted projects
use real identities, distinct staging/production origins and keys, reviewed
migrations, provider configuration and real backup controls. The guarded
[deployment runbook](DEPLOYMENT.md) is the hosted path; no hosted reset or seed,
production-to-staging copy, broad history repair or unreviewed provider send is
part of this guide.

## 16. What not to commit

Never commit `.env.local`, generated keys, real project refs, raw Auth/session
output, test accounts' private data or local-only provider/test-OTP settings.
Do not overwrite a shared tracked config to remove somebody else's work; preserve
local changes and use a separate disposable project for a different test setup.
CLI state under `supabase/.temp` and `.branches` stays ignored. The offline
`verify:local-supabase` gate checks placeholders, cross-links and secret shapes;
it does not start Docker, connect to a DB or read `.env.local`.

## 17. Manual smoke checklist

- [ ] Correct project/ports identified; existing data preserved or fresh disposable reset explicitly scoped.
- [ ] Full ordered history and current policy identity verified; no fabricated acceptance.
- [ ] `/api/health`, `/api/ready`, `http://localhost:3000/jobs` and `http://localhost:3000/login` behave as above.
- [ ] No production mocks, private company leak or pending/expired/suspended-owner publication.
- [ ] Verified caller role, current policies, AAL1 denial and active+AAL2 admin paths hold.
- [ ] Employer posting/revision review, seeker application/withdrawal, messages, reports, quotas and audit behavior pass.
- [ ] Real local production suite and separate development shell suite recorded independently.
- [ ] Any actual hosted/provider/physical-device gap remains UNVERIFIED; no local PASS becomes public Go.
