# Environment evidence — California launch

**Actual hosted release: UNVERIFIED / NO-GO.** Local implementation and synthetic
configuration checks are not a deployment, legal review or provider test.
D1 integration started from `cec83805d6a8ee25c962f599f2ee4dc43bf90105`; D1 commit
is the commit containing this evidence. All D1 commands use Node22.23.1 in
`.worktrees/california-public-launch`. No secrets, email addresses or raw private
row exports are recorded here.

| Environment | Actual identity/access | State |
| --- | --- | --- |
| Local disposable | project `albalmon-ca-launch`, API55321 / DB55322 | Available; original543xx/native5432 untouched |
| Vercel Preview + staging Supabase | actual project/ref/origin unselected | UNVERIFIED |
| Vercel Production + production Supabase | actual project/ref/domain unselected | UNVERIFIED |
| Recovery | separate actual project/ref unselected | UNVERIFIED; D2 owns rehearsal |

Earlier read-only capability probes found Supabase CLI2.109.1 unauthenticated,
Vercel CLI59.13.1 logged out and no `.vercel/project.json`; selected in-app Vercel
and Supabase dashboards redirected to login. No login submission, account/project
creation, billing or hosted mutation occurred. Owned probe tabs were closed.
This says nothing about another browser profile or whether an existing account
contains real production data. Actual existing-project reuse assessment remains open.

## Existing-data inventory

Run [environment-inventory.sql](environment-inventory.sql) in the verified target
using a protected operator read connection. It is one **read-only transaction**,
with current migration/business counts plus the exact B1 CA/pay/city and B2
missing-expiry/ambiguous-publication queries. Before lifecycle columns exist, run
only applicable CA/pay/city queries, then complete the lifecycle inventory after
additive migration. The final policy table inventory uses a plain SELECT because
`current_policy_identity()` intentionally acquires FOR SHARE; that RPC remains
appropriate for separate bounded anonymous release checks.

For every identified hosted row record in restricted evidence: target/ref, job ID,
company ID, original status/city/state/pay/unit/publication/expiry, owner/source
verification reference, actual workplace and applicable wage rule/date, whether
publication is independently known, operator decision, actor/time and resulting
normal review action. Keep IDs/private source material out of public evidence.

Pause incompatible public rows and ask the actual owner/source to correct known
workplace/pay information; do not delete history, invent base pay, bulk-normalize
unknown cities or assign fabricated approval dates. The verified exact alias
`Los Angeles (Koreatown)` maps to city `Los Angeles`, retaining `Koreatown` in
address display; no other parenthesized-city rewrite is authorized. An old
`posted_at DEFAULT now()` is not proof of approval. Approved/null-expiry rows
remain hidden by the canonical public predicate until trusted review resolves
them; confirmed new approval uses a fresh real 30-day window. Preserve prior
application and audit evidence while pausing/correcting records.

## Curated B1/B2 predecessor evidence

B1 local search verification covered California scope, literal punctuation,
pay-unit inference, city filtering, stable pagination and safe public projection.
Its known alias regression failed then passed after exact alias normalization.
B2 verified the publication lifecycle/CAS matrix, post-lock public eligibility,
concurrent closure versus application admission and retained history. At their
recorded local snapshots there were 11 approved/open fixtures, zero non-CA,
nonpositive-pay or approved-incompatible rows; B2 found zero approved/null-expiry
and two intentionally historical pending/draft publication timestamps. Hosted
inventories were explicitly UNVERIFIED, with no backfill or invented dates.

Useful preflight and verification content from accidentally tracked scratch
`task-5-report.md` and `task-6-report.md` is preserved here and in the SQL above.
Those scratch paths are removed from the Git index while local files remain for
controller recovery. No history rewrite or unrelated scratch deletion.

## Actual D1 local evidence (2026-09-11 UTC)

- `npm run setup:local-policy`: PASS, current bundled draft already matched,
  so **no activation or acknowledgement mutation**. Initial-pointer-only CAS
  mechanics for revised draft/reviewed bundles are separately synthetic tests.
- Read-only inventory on55322: **21 applied migrations**, Auth3/profiles3/
  companies3/jobs13; applications/messages/reports/employer requests/outbox/
  webhook receipts0; audits11. All jobs CA, hourly12/annual1; invalid CA/pay0,
  approved/null-expiry0, ambiguous pending/draft2; public view11; acknowledged
  profile/job identity rows0/0. No cleanup/backfill performed or necessary.
- Exact pointer: `draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7`.
- Initial inventory attempts exposed a receipt table-name typo and the RPC's
  read-only-transaction lock restriction; both exited nonzero and rolled back.
  Corrected SQL is the delivered runnable inventory; failed attempts are not PASS.
- Focused guard/smoke/local-policy tests use invented `.test` domains and fixture
  configuration **only within tests**; they cannot establish project ownership,
  policy approval, environment setup or actual release readiness.

At 2026-09-11 06:24–06:25 UTC, `npm test` passed **731 tests / 6 existing opt-in
skips** (65 passed / 2 skipped files); standalone typecheck and lint passed.
`verify:beta` and `verify:local-supabase` each passed **7/7**. The former now
checks current migration history names/duplicates and native Vercel release build,
not a historic migration count or 16-section beta structure. Both scan nested docs.

The ordinary local production build used actual owned local public API/anon
settings and an explicitly **synthetic** `https://staging.k-work.test` canonical
with indexing=false; service credentials were removed from child build/server
environments. Final build passed. Earlier build attempts failed TypeScript checks
in new test fixtures (ProcessEnv and fetch signatures, then optional return);
those were corrected before the successful build/typecheck. Local HTTP checked
`/jobs`, `/terms`, `/privacy`, `/login` all200 with blanket noindex/nofollow,
compiled staging canonical, robots excluding `/` without sitemap advertisement,
dynamic sitemap origin, readiness200 and worker401 for both missing and
structurally invalid authorization. Owned3100 server stopped in `finally`.
This is actual local HTTP evidence, **not** real hosted protection, DNS or mail.

Actual `npm run build:release` exited1 with `Missing release setting:
NEXT_PUBLIC_SITE_URL`, before Next build. Actual policy manifest remains draft.
Public release therefore remains blocked; successful synthetic validators do not
change that result. `verify:deploy-target -- staging` also exited1 because the
actual staging project ref is unselected. No full D1 DB/browser/restore campaign
was duplicated. A temporary copied checkout with **synthetic reviewed** facts
passed the58 focused release/policy/bootstrap tests, proving reviewed configuration
does not require scattered test edits. Its temporary directory was removed;
actual source facts and the database pointer were untouched. Final focused release
and smoke recheck:58/58; focused lint passed after ensuring CLI errors print no
response bodies and the real-CLI fixture always clears its missing target ref.
D2 owns comprehensive final browser/database/fault/restore timings; predecessor
counts and this local inventory do not replace that campaign.

## Actual external gates still missing

Existing hosted inventory/migration history and project reuse decision; chosen
operator/public contact/domain; real reviewed policy bundle/activation/notices;
Vercel effective build/env/protection and deployment; Google console/Supabase
Auth callbacks and real Google login; founding admin/TOTP/AAL2; verified Resend
sender/DNS/inbox/webhook; actual Production scheduler/plan/lease behavior; hosted
privacy/backup/restore/rollback; physical-device/performance/search-index checks.

Preview has no Vercel platform cron merely because `vercel.json` contains one.
Read-only smoke never sends valid worker auth or a signed suppression webhook.
Actual positive provider tests require explicit mailbox/send authorization and
remain UNVERIFIED. A staged Production request URL remains distinct from its
compiled Production canonical. All evidence entries need actual UTC, SHA,
target/ref/origins, exact action/result and a non-secret evidence reference before
an operator can mark the corresponding [launch gate](../LAUNCH_CHECKLIST.md) PASS.
