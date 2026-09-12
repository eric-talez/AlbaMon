# 개인정보 요청 운영 절차 / Privacy requests

**DRAFT operational runbook. Real support mailbox, accountable operator, retention
schedule, response commitments and external review are UNVERIFIED.** No user-facing
instant-delete feature or blind production Auth-delete procedure is provided.
The tools below are service-role operational tools, never app/browser endpoints
for arbitrary users. They do not establish the requester’s identity themselves.

## Request record and verification

1. Receive the request through the real support/privacy mailbox once configured.
   Until then, the public draft explicitly says the channel is unconfirmed; do not
   claim a request was received or an email was sent. Create a random request ID.
   In a restricted case record capture type (access/correction/deletion), receipt
   time, request scope, accountable operator, identity verification state,
   review/hold state, approved actions, evidence references and completion state.
2. Verify possession of the **existing authenticated account**, using a trusted
   Supabase `auth.getUser()` result in that account's existing signed-in session,
   and its verified account email. Tie the request ID to that verified user ID
   through the controlled request communication. A UUID, emailed screenshot,
   supplied email address, profile display name, or admin lookup alone is not
   evidence that the requester controls the account. Never collect passwords,
   access/refresh tokens, MFA/OTP codes, passport/visa or I-9 documents in the case.
   The tool's admin lookup only checks that the verified account still exists.
3. If identity cannot be verified, stop **data disclosure and mutation**; record
   identity-review escalation. The owner must approve an alternative recovery or
   authorized-agent process after legal review. Do not invent verification rules,
   response deadlines or an automatic denial. Privacy requests do not require
   prior policy acceptance or active writing privileges.

Minimal protected request input (values below are schematic, not a real case):

```json
{
  "requestId": "REQUEST_UUID",
  "subjectId": "VERIFIED_ACCOUNT_UUID",
  "verifiedUserId": "THE_SAME_VERIFIED_ACCOUNT_UUID",
  "identityEvidenceReference": "protected case evidence reference",
  "scopeReviewReference": "reviewed access or suppression scope reference",
  "allowedActions": ["inspect", "export"]
}
```

Store this outside the repository in a restricted case directory. The references
must point to real operator observations/review, not merely to these example
strings. Record manual reviewer, time, method and decision in the protected case.
Supply existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the
operator process from protected runtime settings. Never echo keys, put them in
CLI arguments, copy them to the browser/app build, or use hosted data in local
rehearsals. A staging/production operator must verify the intended project first.

## Bound impact inspection and access preparation

- Run `node scripts/privacy-request.mjs inspect /protected/request.json`.
  The service-only `privacy_request_impact(subject_id uuid)` RPC uses one bound
  UUID, a consistent read snapshot, and returns **counts only**. It counts Auth,
  profiles, owned companies/jobs, own and owned-job applications, own/thread
  messages, other applicants and senders, cascading reports, reporter/actor/reviewer
  unlink effects, access requests, recipient outbox and webhook receipts. Inspect
  active holds, hosted Auth, backups, logs and provider records separately.
- Real current FK paths include `auth.users → profiles → companies → jobs →
  applications → messages`, seeker profile → applications → all thread messages,
  sender profile → sent messages, job/company → reports, requester → access
  request, profile → outbox → webhook receipt. Reporter, audit actor and reviewer
  links can be nulled. An employer deletion can destroy another person's entire
  application and conversation; an applicant deletion can destroy employer
  messages. Zero `third_party_applications` alone does **not** mean zero impact.
- Run `node scripts/privacy-request.mjs export /protected/request.json /protected/REQUEST.json`.
  The tool refuses overwrite and writes mode 0600. The output is a **candidate**,
  with account attributes, own profile/acknowledgements/preferences, owned
  company/jobs, own applications/messages/reports/access requests and recipient
  notification summary. Received applications contain only IDs, status and time:
  other applicants' identities, email, notes and messages are excluded. Internal
  audit/review metadata, Auth secrets and raw provider payloads are excluded.
- An operator reviews requester-authored free text for third-party personal data,
  narrows further to the requested scope and documents redactions. Assess whether
  omitted shared records require a separate reviewed redacted response; the
  conservative candidate alone is not a determination of legal access rights.
  Never send the candidate automatically. Use a protected authenticated delivery
  channel approved for the case, verify the recipient again, and record the final
  export hash, access grants and delivery receipt. Do not put contents in logs,
  commits, screenshots, traces or completion reports.

## Retention/hold and deletion decisions

1. Assign an accountable owner/reviewer to decide each category's processing
   scope: retain, correct, delete, anonymize, or defer under a documented hold.
   Record legal basis/purpose, applicable date, period and trigger, backup/log
   treatment, processor responsibility and an evidence reference. The actual
   retention policy and legal applicability are not selected by this code.
2. For linked accounts, set `pending_retention_or_preservation_review`. Preserve
   applications, messages, reports and relationships while deciding how to retain
   other participants' records. Notify the verified requester of the proposed
   scope and unresolved dependencies through the actual channel; record what
   remains outstanding. A hold/escalation is **not completed erasure**.
3. Before any linked-account erasure, the owner must choose a reviewed strategy
   and engineers must implement the necessary FK/ownership/access treatment.
   Rehearse it on a disposable staging copy with both participant directions,
   reports/audits, outbox/provider state and protected recovery evidence. Compare
   pre/post counts, surviving contents and each participant's history access;
   verify that removed access and notifications cannot resume. Have the operator
   review the exact impact again immediately before executing the scoped plan.
   The current migration deliberately does not invent tombstones, archival tables,
   retention periods or a universal preservation strategy.
4. This release includes **no production account-deletion command**. The local
   integration test deletes only its own empty-scope toy account after every
   dependency/unlink count is verified zero. This proves that bounded fixture
   path only; it does not approve real retention or solve linked-account erasure.
5. Pending/deferred processing can still perform an independently reviewed
   correction, access response or email suppression. Record each partial action
   and leave the case open for remaining erasure work. Do not label the full case
   complete just because an export or suppression succeeded.

## Suppression, completion evidence and export disposal

- Add `suppress` to a case's reviewed allowed actions only when the requested scope
  supports it, then run `node scripts/privacy-request.mjs suppress /protected/request.json`.
  It sets the existing trusted `profiles.suppressed_email` flag without replacing
  the user's notification preference. C1 worker checks the flag and recipient
  account state before delivery. A currently in-flight provider request may have
  crossed the check; coordinate worker drain/leases and inspect outbox plus hosted
  provider evidence before promising cessation. Never claim recall of sent email.
- Record request ID, verified identity evidence reference, approved scope/holds,
  operator/reviewer, tool/migration versions, inspection counts and date, executed
  actions, actual affected counts, redaction decision, export hash and controlled
  delivery evidence, suppression/worker state and hosted provider result. Keep
  contents and credentials separate. Scripts print only request/action/time,
  counts, suppression outcome or candidate hash—not PII or file contents.
- Completion notice states exactly what was accessed/corrected/deleted/suppressed,
  what remains held/retained or pending, and the reviewed reason/process for the
  unresolved portion. Confirm external provider and backup/log treatment under
  the approved schedule; service DB success does not prove provider erasure.
- Close only the approved completed scope. Set an owner/due review for remaining
  work under the actual approved response policy. After authorized delivery and
  the approved export/evidence period, revoke access, remove exports and temporary
  copies from protected storage and record disposal evidence/hash reference.
  No period is invented here. On local disposable rehearsal, the test's temporary
  export is immediately removed in `finally` and absence verified.

## Executable local rehearsal and remaining launch evidence

`RUN_PRIVACY_LOCAL=true npm test -- tests/privacy-requests-local.test.ts` uses
only the owned `http://127.0.0.1:55321` stack. Real disposable verified Auth
accounts acknowledge through their own sessions; owned company/job/application
and two-way messages make cascade effects nonzero. A local transaction also proves
the actual Auth-delete cascade and rolls back, restoring both participants’ records. It exercises service-only
inspection, operator tool identity/scope checks, protected export and redaction,
preserving linked records by withholding deletion, real worker suppression with
external delivery blocked, empty-scope toy deletion, export disposal and owned-ID
cleanup. It makes no external email call. `RUN_NOTIFICATION_LOCAL=true npm test
-- tests/notification-local.test.ts` retains C1's separate local delivery contract.

**UNVERIFIED before public launch:** actual mailbox intake/verified request
communication; owner retention/hold/rights decisions; linked-record erasure and
surviving participant access under the chosen strategy; protected real delivery
and disposal settings; hosted Auth/backup/log/provider actions and evidence;
reviewed response/appeal/agent procedures. Execute each missing hosted step with
owned staging fixtures after the owner decisions, record exact results, and keep
public release blocked until the real policy bundle and operations are reviewed.

Policy identity evidence (00710): include the subject's `policy_identity`, owned
jobs' `posting_policy_identity`, and the scoped `policy_acknowledgements` export
section when relevant to the reviewed access scope. These contain prior/current
identity and database times, not private legal review correspondence. Resolve an
identity against the protected immutable bundle archive; review this evidence's
retention/hold/disposal purpose with the other audit records. No automatic erasure
or retention duration is introduced by this change.
