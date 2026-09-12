# Database — California public launch

SQL in [supabase/migrations](../supabase/migrations/) is the source of truth.
The [ordered inventory](DEPLOYMENT.md#current-migration-inventory) and checksum
manifest cover the current history. Use the [local guide](LOCAL_SUPABASE.md)
for disposable replay and the guarded [deployment procedure](DEPLOYMENT.md)
for hosted changes. Never seed or reset a hosted database, paste historical SQL
as an alternate deployment path, or rewrite applied migration files.

## Tables

| Table | Purpose and access |
| --- | --- |
| `profiles` | Auth-linked current role, active/suspended state, preferences and explicit policy acknowledgements. Self-service fields are guarded; roles/status/evidence cannot be forged by ordinary callers. |
| `companies` | Caller-owned employer identity/contact fields; private owner/admin reads. Verification is an administrative signal, not a safety or legal guarantee. |
| `jobs` | California workplace/pay data, publication lifecycle, revision and job policy evidence. Only canonical open jobs are public. |
| `applications` | One application per seeker/job, bounded cover note, status and revision. Seeker withdrawal is terminal; owning employers manage the supported non-withdrawn status workflow. |
| `messages` | Bounded application-thread messages by the applicant or current owning employer. Participant, active-account and terminal-state rules are enforced in Postgres. |
| `reports` | Caller-owned job reports with bounded reason/details and uniqueness; active AAL2 admins review or dismiss. |
| `employer_access_requests` | Seeker requests for employer access, one pending request per account; approval and role promotion are transactional. |
| `audit_logs` | Retained lifecycle, moderation, suspension and policy events. Ordinary API roles cannot edit/delete audit evidence. |
| `notification_outbox` | Private durable event queue with claims, retries, frozen payload/idempotency state and provider identifiers; trusted notification worker only. |
| `email_webhook_receipts` | Private signed delivery-event deduplication and suppression evidence. |
| `policy_publication` | Service-controlled current facts/prose bundle identity; anonymous read via bounded RPC, trusted CAS activation only. |
| `rate_limit_buckets` | Private HMAC subject counters for the retained optional local OTP limiter; no ordinary API-role policies or grants. |

RLS is enabled on every table. Table privileges, RLS, guarded triggers and
caller-bound functions work together; an application guard is not a replacement
for the database boundary. Reviewed privacy operations preserve dependent audit,
policy, outbox and webhook history according to the actual retention decision.

## Public reads and lifecycle

`public_job_listings`, `search_public_jobs` and the cookie-free sitemap use the
canonical `is_job_open` rule: California workplace, approved status, unexpired
listing and eligible owner. Unknown historical publication/expiry values are not
invented for hosted data. Company identity is exposed through the safe listing
view; `companies` base-table phone/contact/owner fields are not public.

`transition_job(target_job_id, command, expected_updated_at, reason)` locks the
current job, checks caller role/ownership, policy and revision, and handles the
approved lifecycle. Approval records actual publication and 30-day expiry;
rejection/pause require a reason. A stale revision returns conflict rather than
overwriting a later decision. The legacy `moderate_pending_job(uuid,text)` RPC
is retired by the final compatibility migration.

Applications recheck admission when inserted. Caller-bound dashboard/thread
functions expose only the participating user's or owning employer's records.
`withdraw_application` uses the expected revision; withdrawal is terminal and
preserves application history. Production builds and runtime never replace DB
errors with sample jobs or simulated writes.

## Authorization and policy publication

Auth session validation and `profiles.role` establish identity/role; form fields
and `user_metadata.role` do not. Owner policies recheck current employer/admin
status. `is_admin()` requires a currently active profile and AAL2; application
admin guards also check the verified session. Founding-admin promotion is an
operator procedure followed by TOTP enrollment, not a user-editable role field.

The current policy pointer represents the exact checked-in facts/prose bundle.
`activate_policy_publication(expected_identity,next_identity)` is service-only
CAS, and activation never fabricates user/job acceptance. Protected writes check
the current pointer through their transaction; stale acceptance blocks them.
Existing read/history and defined withdrawal/containment paths remain available.
See [policy review](legal/launch-policy-review.md) for archives and coordinated
activation/deployment. Never change historical migration seed values to publish
new policy facts.

Business write quotas use Postgres triggers and transaction locks for
applications, reports, messages, employer-access requests and company/job
creation. They execute alongside the verified caller's business mutation;
there is no service-role preflight or fail-open production bypass. The separate
optional OTP `consume_rate_limit` RPC stores HMAC subjects only and is executable
only by `service_role`; phone sign-in remains disabled in production.

## Admin audit trail

Job/company lifecycle triggers and report/employer-access moderation triggers
are the sole writers for their corresponding entity changes. The final
compatibility migration removes duplicate audit inserts from the incoming July
RPC bodies while retaining row locks, active AAL2 authorization, current-policy
checks and transactional employer promotion. A failed/conflicting decision
commits neither the entity change nor an audit row.

`set_company_verification`, `review_report` and
`review_employer_access_request` use the caller-authenticated session. Company
verification records `company.verification_changed`; report and employer-access
events retain their status-based action names. Metadata contains bounded state
transitions, not private messages/contact details or arbitrary free text. Actor
identity comes from `auth.uid()` inside Postgres. Job rejection/pause reasons
remain in the restricted lifecycle review record.

The append-only guard rejects audit UPDATE/DELETE by `anon`/`authenticated`,
including admin sessions through the authenticated API role. Trusted maintenance
and permitted FK handling retain their separate operational boundary. No user
flow receives a service-role client to perform moderation or create audit rows.

## Table grants (Supabase API roles)

`20260707000000_explicit_table_grants.sql` introduced deterministic API-role
grants, preventing real sign-ins from failing the profile lookup on projects
without implicit privileges. Later migrations narrow the resulting surface.
`20260713000000_restrict_company_public_reads.sql` and the September private
company migration remove public base-table access while retaining safe view
reads. Review the final ordered state, not the initial grants in isolation.

Operational tables revoke ordinary API grants and expose narrow functions only
where needed. `SUPABASE_SERVICE_ROLE_KEY` stays server-only for trusted worker
and operational actions; its presence is not evidence of provider readiness.
Static tests pin grants/functions; live local SQL checks verify effective
Postgres behavior. Fresh replay, preserved-data upgrade and restored-data checks
must each record the history and source actually exercised.

## Verification

`npm run test:db` runs transactional local SQL assertions on the selected
isolated stack. `npm run test:e2e` exercises a production build against real local
Auth/Postgres; `npm run test:e2e:dev` separately covers the credential-free
development shell. Historical Slice SQL tests describe their original migration
in isolation; compatibility assertions verify the final integrated state.
Dated [launch evidence](launch-evidence/release-candidate.md) retains its exact
source, counts and limits. None of these checks substitutes for actual hosted
backup/restore, provider configuration, legal review or public release approval.
