# Historical beta readiness — superseded

The California public launch supersedes the old private-beta runbook. Its
old migration counts, policy exceptions, manual-only browser testing and
deployment shortcuts are historical, not current release instructions. The
source history retains those Slice-era procedures when historical context is
needed. `npm run verify:beta` remains the offline launch-documentation gate;
a PASS is not hosted readiness or public release approval.

Use the current documents in this order:

1. [Owner handover and production execution record](launch-evidence/production-release.md): exact candidate identity, actual NO-GO gaps, guarded Production creation and promotion.
2. [Deployment](DEPLOYMENT.md) and [environment variables](PRODUCTION_ENV_VARS.md): target inventory, current ordered migrations, separate Preview/staging and Production settings, protection and read-only smoke.
3. [Local Supabase rehearsal](LOCAL_SUPABASE.md): isolated local Auth/Postgres/RLS, current policy setup, production browser checks and separate credential-free development coverage.
4. [Launch checklist](LAUNCH_CHECKLIST.md): the actual sign-off of record for policy, security, full journeys, provider delivery, physical devices, backup/restore and public Go.
5. [Operational health](OPERATIONAL_HEALTH.md) and [first 30 days](operations/first-30-days.md): configuration/readiness, notification containment, rollback and support operations.

Public release remains **UNVERIFIED / NO-GO** while the operator, support,
domain, reviewed policy facts or actual hosted/provider evidence are missing.
Local tests cannot select those facts or waive a public-release gate. These
operational documents are not a substitute for attorney review and are not
legal, tax, immigration, or employment advice.

Ordinary business writes use caller-authenticated database authorization and
quotas. Trusted notification processing uses `notification_outbox` and a
server-only service-role key; the optional `consume_rate_limit` path is retained
for local OTP rehearsal. Phone sign-in remains disabled in production. There is
no claim that the service-role client has no consumer or that the limiter is its
only consumer.

<a id="17-social--phone-auth-verification"></a>

Legacy provider-verification links resolve here. Use the current
[OAuth and protected smoke procedure](DEPLOYMENT.md#oauth-preview-protection-and-read-only-smoke)
and [local auth rehearsal](LOCAL_SUPABASE.md#9-login-and-signup). Google requires
actual configuration and evidence; Kakao/Naver/Phone remain disabled for this
launch. The former beta provider checklist does not enable them.
