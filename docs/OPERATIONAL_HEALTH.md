# Operational health — California public launch

Public release is **NO-GO** until [release evidence](launch-evidence/release-candidate.md)
and the [launch checklist](LAUNCH_CHECKLIST.md) contain actual sign-off.
[Deployment](DEPLOYMENT.md), [environment settings](PRODUCTION_ENV_VARS.md),
[restore rehearsal](launch-evidence/restore-drill.md) and
[privacy operations](operations/privacy-requests.md) are the current runbooks.

D2 local verification on 2026-09-11 passed 498 database assertions, 27 browser
cases, restored local Auth login and immutable same-identity rollback. Five
destination-stream warnings remain unresolved; detailed limits and exact artifact
identities are in the linked release/restore evidence. This is not hosted readiness.

## Health, readiness and alert response

`GET /api/health` is public, no-store and always 200 when the app process answers.
It reports coarse configuration presence only; it never connects to Supabase.
`GET /api/ready` is the bounded anonymous database dependency check; require 200
and its ready result, and alert on 503, timeout or unexpected response. Neither
endpoint proves Google login, real mail, correct RLS or legal review. A service
key is required only by trusted notification/operational paths, never user flows.

Configure the selected external monitor for both endpoints and a public `/jobs`
render: check every 1–5 minutes and alert the actual on-call destination after two
consecutive failures. Record the actual monitor ID, destination, triggered alert,
acknowledgement time, recovery alert and owner. All are currently **UNVERIFIED**.
Use a disposable staging deployment with a deliberately invalid public DB key
for fault injection; never change production secrets to simulate failure.

During an incident, record UTC, deployment/source/artifact identity, safe route
class/status, affected scope and last successful check. Never capture cookies,
headers, callback queries, Auth values, private applications/messages or exports.
Inspect deployment changes and protected platform logs; stable error codes are
triage evidence, not permission to copy raw private errors into this document.
Compare complete ordered migration history with the current source directory;
missing grants and RLS denials require separate diagnosis. Never reset, seed or
repair history to make a health check green.

Missing production Auth configuration fails closed; development fallback is only
for local development. Wrong public DB credentials produce dependency failure,
not sample jobs. Build-time public origin/indexing/provider values require a
fresh build after correction. Check public HTML and sample-ID 404 along with
readiness after restoring configuration.

## Email activation and queue recovery — UNVERIFIED

1. Select actual separate staging/production Resend credentials, verified sending
   domain/from mailbox and signed webhook endpoints/secrets. Verify SPF/DKIM and
   the chosen DMARC policy in the provider and DNS. Keep delivery disabled until
   these checks pass; `email=configured` establishes settings only.
2. Configure the exact staging controlled-recipient allowlist. Verify the actual
   hosting plan supports the one-minute schedule and inspect actual invocations.
   Preview receives no platform cron; use the deployment runbook's explicit
   environment mapping. Record scheduler evidence separately from a manual run.
3. With explicit authorization for the real test mailbox, create one business
   event and invoke the worker through protected operator tooling. Valid-auth
   GET `/api/internal/notifications` sends mail and is never a read-only smoke.
   Record protected provider evidence reference, queue completion, inbox/spam
   receipt, signed bounce/complaint receipt and subsequent suppression. Verify
   an unallowlisted staging recipient is suppressed. Do not record addresses,
   secrets, raw payloads or headers here. Actual sends remain NOT RUN.
4. If the queue stalls, inspect aggregate queue status in the active AAL2 admin
   UI, cron configuration, provider status, confirmed Auth address, preference
   and `suppressed_email`. Disable `EMAIL_NOTIFICATIONS_ENABLED` to pause new
   claims; an in-flight provider request may already have crossed the guard.
   Preserve pending/sending rows, leases, provider IDs and frozen payloads.
5. Transient provider failure leaves business data committed and retries with
   the same outbox ID/idempotency key and frozen payload. A lost completion write
   leaves `sending`; after lease expiry the worker reconciles/retries within its
   bounded idempotency window. Do not clone the row, clear its payload, reset
   attempts or manually resend an uncertain delivery. Inspect provider records
   first. Exhausted/expired entries fail with stable codes and require reviewed
   operator resolution; restoring credentials does not make them safely new.
6. Signed webhook replay is deduplicated by `email_webhook_receipts`; a bounce
   racing with completion still suppresses the verified recipient. Preserve
   receipt/outbox dependencies during privacy work and restore. Re-enable only
   after resolving configuration and confirming the known uncertain sends.

The local notification integration uses a loopback provider double, real local
Auth/database, concurrent claims and signed fixture webhooks. It proves retry,
lease/idempotency and suppression behavior, not real DNS or inbox delivery.

## Incident recovery and rollback

For suspected exposure or authorization failure, contain affected access and
rotate the actual compromised credential at its provider through approved
operator tooling, update only the corresponding environment and redeploy.
Coordinate factual S1/S2 notices through the selected support channel; no channel
or real notice is configured by this rehearsal.

Select a previously tested immutable application artifact with the **same active
policy identity**. Verify its digest and write/history compatibility against the
current database before promotion. Never assume stateless or additive schema
means every old app can write. Do not reactivate older terms during code rollback;
policy changes need the separate [reviewed CAS procedure](legal/launch-policy-review.md).
Retain audit and acknowledgement history. A DB reset is never app rollback.

Restore backups only into a separately identified disposable recovery project.
Verify the exact schema, data, FK/RLS/grants/RPC/Auth/audit/policy/history scope,
then separately restore/test hosted provider, keys, OAuth, DNS and hosting settings.
Record backup age and actual recovery time against RPO ≤24 hours/RTO ≤4 hours;
local logical timings do not establish those hosted objectives. After app rollback,
inspect active cron separately because deployment rollback does not update it.

## CA publication signals (C4)

`/admin/analytics` calls `admin_marketplace_signals(reference_date)` as the verified session. The database requires a currently active AAL2 admin; it returns aggregates only, without applicant/message bodies. Existing all-status moderation totals remain separate.

- `cohortCount`: CA workplace jobs whose latest actual `posted_at` is in the inclusive interval `[referenceDate − 28 days, referenceDate − 7 days]`. Closed, expired and paused historical publications remain eligible. No owner-status exclusion. Unknown historical publication timestamps are excluded and belong to the D1 inventory; never fabricate a backfill. Reposting uses the current/latest publication timestamp.
- `appliedWithin7Days`: cohort jobs with at least one application in the inclusive interval `[posted_at, posted_at + 7 days]`, excluding currently withdrawn applications and applicants whose profile is currently suspended. The headline percentage is `100 × appliedWithin7Days / cohortCount`; no cohort renders “관찰 가능한 공고 없음”, not 0%.
- `medianFirstEmployerReplyHours`: use the same eligible applications. For each, take the first message whose sender is the current company owner and whose timestamp is in `[application.created_at, referenceDate]`. Compute elapsed hours from application creation; median only among answered applications. No answered samples means null, not zero hours.
- `unansweredApplicationCount`: eligible applications with no qualifying reply. Seeker/admin/nonowner messages do not count. Ownership transfer is not currently a product flow; if introduced, historical attribution needs an immutable ownership record.

The aggregate runs inside Postgres, so the REST 1,000-row limit does not truncate the population. These are publication/application/reply signals, not visit conversion, retention, or completed hires. `offered` means an offer status only. External product analytics and visit collection remain deferred.

Public SEO uses the canonical open-job view (`is_job_open`) through an anonymous cookie-free dynamic sitemap, reading every stable-ID range of 1,000. Database/configuration failure fails the sitemap safely; it never emits mocks or a partial success response. Split sitemaps before 50,000 total URLs (including static pages). JobPosting includes only visible facts and full paragraph-formatted employer content, with HTML escaping followed by separate script serialization escaping. Unknown posted_at yields no JobPosting. Closed/expired jobs return 404 and disappear from the sitemap. [Google’s JobPosting guidance](https://developers.google.com/search/docs/appearance/structured-data/job-posting) does not guarantee search exposure; deployed-domain Search Console and URL Inspection are external release gates.
