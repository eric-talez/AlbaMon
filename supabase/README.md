# Supabase — schema, migrations and local fixtures

`migrations/` is the source of truth for schema, grants, RLS, functions and
triggers. The [current ordered inventory](../docs/DEPLOYMENT.md#current-migration-inventory)
and checked-in checksum manifest cover every migration. The September launch
lifecycle/policy/security rules and the final main/launch compatibility migration
supersede earlier Slice behavior without rewriting historical SQL files.

- `config.toml`: isolated `albalmon-ca-launch` local stack, API 55321/DB 55322.
- `migrations/`: ordered additive database history.
- `seed.sql`: fictional local-only Auth/company/job fixtures; never hosted data.
- `tests/`: transactional local SQL checks; run with `npm run test:db` on the identified disposable stack.

## Apply locally

Use Node 22, Supabase CLI 2.109.1 and Docker. First inspect the selected project
and any retained local volumes. Do not stop original 543xx or native 5432 services.

```bash
supabase start
```

This resumes existing owned data when present. Only a newly created, explicitly
disposable database may be reset with `supabase db reset --local`; that destroys
its data, replays all migrations, then applies the local seed. Never reset a
populated stack to reconcile migration history or policy identity. After fresh
migrations, run `npm run setup:local-policy` against API 55321/DB 55322. It uses
CAS to align the immutable initial draft with the current checked-in bundle;
it never acknowledges policies for a user or job.

The complete [local Supabase guide](../docs/LOCAL_SUPABASE.md) covers protected
key handling, current history checks, auth modes and the smoke checklist.

## Hosted migrations

Use only the guarded [deployment runbook](../docs/DEPLOYMENT.md) for staging
and its linked D3 Production procedure. It checks the exact source, selected
project, ordered history, backup, reviewed dry-run and manifest before applying.
Do not paste migrations or seeds into a hosted SQL editor as an alternate
installation path. No hosted reset, seed, history repair or `--include-all`
shortcut is part of the launch procedure.

The incoming July files precede already released September files. A populated
local stack with the older launch-only history needs a separately recorded
upgrade rehearsal; a hosted history mismatch requires an explicit migration
plan. Fresh ordered replay and existing-data upgrade are different checks.

## Current database behavior

See [DATABASE.md](../docs/DATABASE.md) for tables and authorization boundaries.
Public jobs use the canonical California/approved/unexpired/eligible-owner
predicate. Company base-table fields remain private; public identity comes only
through the safe listing view. Production builds and runtimes never use mocks.

Caller-authenticated writes enforce current roles, active status, policy identity,
ownership, CAS revisions and quotas in Postgres. Active AAL2 administrators use
transactional review functions; entity changes have one retained audit event.
`transition_job` is the moderation path; the old `moderate_pending_job` entry
point is retired. Ordinary user flows do not use the service-role client.
Trusted notification/operations paths use that key server-side; the private
`consume_rate_limit` infrastructure remains for local OTP rehearsal only.

The seed contains three fictional employer identities and companies, 11 approved
jobs plus one pending and one draft job. Its publication/expiry values are local
fixtures and cannot establish real publication history. Tests create additional
transactional fixtures as needed. Public release requires absence of every
known fixture identity; do not reuse these accounts or data on hosted projects.
