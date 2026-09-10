# Task 6 / B2 implementation report

Status: DONE for authorized local implementation and verification. Worktree `/Users/rinny/IdeaProjects/AlbaMon/.worktrees/california-public-launch`, branch `codex/california-public-launch`, base `18bacc89c24b8d6e20d6af42b1098e18febe1ce8`. No subagents or reviewers were dispatched.

## Implemented contracts

- Added only migration `20260909000300_job_lifecycle.sql`. `is_job_open(uuid)` is the canonical SQL/STABLE/SECURITY DEFINER predicate: approved, CA, future non-null expiry, and active owning profile. Company verification is deliberately absent. Base public RLS, the safe public view, application INSERT RLS, report INSERT RLS, and both application listing flags consume it.
- Preserved the public view's first 24 columns and appended `expires_at,updated_at`. Existing B1 search and city RPCs keep their view return type and safe projection. App `Job.expiresAt` keeps the full timestamp; public row/select include both timestamps. Development fixtures now have full expiry timestamps and filter expired/non-CA jobs. Production mock gating remains unchanged.
- Added `transition_job(uuid,text,timestamptz,text)` and `get_job_review_note(uuid)` with authenticated-only grants. Identity comes from `auth.uid()` and current database roles. Admin authorization uses A4's active DB-admin plus AAL2 `is_admin()`. Owner authorization requires current employer role, active status, and current company ownership. Unauthorized results are `not_allowed`; authorized stale/null revision tokens produce `conflict` before command validation.
- Approval sets `posted_at=now()` and `expires_at=now()+interval '30 days'`; closure sets `expired` and `expires_at=now()`. Other transitions preserve the last actual publication timestamp. The new default for `posted_at` is null; ordinary inserts cannot provide publication/expiry and receive DB-controlled creation/revision times. No historical production row was assigned a publication time.
- The owner REST trigger rejects changes to job ID, company, boost, publication, expiry, or creation time; safe content edits force pending. It uses the actual invoker role, never a user-settable GUC, to distinguish RPC/trusted writes. RLS still enforces ownership and employer identity. `jobs_zz_advance_revision` runs after the historical timestamp trigger and assigns `greatest(clock_timestamp(),old.updated_at+1 microsecond)`, preventing repeated expected tokens even inside one transaction.
- Application INSERT uses a VOLATILE SECURITY DEFINER trigger that first locks the target job FOR UPDATE, then checks caller identity, seeker role, submitted status, and the canonical predicate in a fresh statement snapshot. It derives the inserted seeker from `auth.uid()` after rejecting identity mismatch. Both app and direct REST inserts take this path; controlled service-role imports and direct postgres fixtures retain explicit trusted access. The TypeScript `createApplication(jobId,seekerId,coverNote)` interface stays compatible and never uses a service key.
- One AFTER trigger writes lifecycle/publication audit rows for RPC and direct trusted changes. Company verification changes are audited too. RPC-local reason context carries only validated reason data and is restored after the update; it is not authorization. Audit rows use `clock_timestamp()` so review-note ordering does not collapse to transaction-start time. Ordinary users retain no audit INSERT/UPDATE/DELETE privilege. The note RPC exposes only the latest non-null rejection/pause reason and timestamp to an authorized owner or admin.
- Extracted `toEmployerJobColumns(input)` for create/edit. `updateEmployerJob(jobId,expectedUpdatedAt,input)` verifies current authenticated ownership and performs an allowlisted pending update with both ID and exact timestamp filters. The edit Server Action reruns the full existing form validation. No company/boost/publication fields are accepted from the edit form.
- Added the owned edit route, prefilled reusable form, target-title and review warning, and save feedback. Owner lists expose edit/pause/close/resubmit with exact revisions and rejection/pause notes. Admin lists expose pending/approved/paused filters, revision-bound approve/reject/pause forms, target title, and reason input. Successful changes revalidate public/detail/apply, owner/edit/application/dashboard, and moderation paths. Existing applications and conversations are retained.

## Explicit transition matrix

The controller confirmed this interpretation of the binding source/actor excerpt. Every combination of the six stored states, five commands, and two actors is tested.

| Actor | Command | Allowed source states | Target | Reason |
| --- | --- | --- | --- | --- |
| Active admin AAL2 | approve | pending | approved | no nonblank reason |
| Active admin AAL2 | reject | pending | rejected | trimmed 1–500 characters |
| Active admin AAL2 | pause | approved | paused | trimmed 1–500 characters |
| Active owner/employer | pause | draft, pending, approved, rejected | paused | no nonblank reason |
| Active owner/employer | close | draft, pending, approved, rejected, paused | expired | no nonblank reason |
| Active owner/employer | resubmit | draft, rejected, paused, expired | pending | no nonblank reason |

Other commands/source combinations and no-ops return `not_allowed`. Content editing is a separate validated pending update. A stale authorized revision returns `conflict`, including when the next command would otherwise be valid. Owners cannot approve/reject; admins do not gain owner-only close/resubmit commands merely from admin status.

## TDD and debugging evidence

All npm/Node/Supabase CLI commands used `env PATH="/Users/rinny/.nvm/versions/node/v22.23.1/bin:$PATH"`. Only isolated `albalmon-ca-launch` API 55321 / DB 55322 was used.

- Database RED: `npm run test:db` failed at the newly authored expiry assertion with `function public.is_job_open(unknown) does not exist`; all 168 existing assertions still passed. The initial lifecycle GREEN was 23/23. It expanded to 100/100 lifecycle assertions, including the complete 60-case actor/source/command matrix, anonymous expiry, seeker denial, revision CAS, trusted fields, new pending timestamps, ownership, review notes, retained histories, reporting, suspension, null expiry, audit, and RPC privileges.
- Unit RED: `npm test -- tests/job-lifecycle.test.ts` failed 3/3 for absent fixture expiry and absent transition/edit helpers. GREEN verifies expiry filtering, original microsecond token forwarding/conflict, and stripping unknown/trusted edit fields while enforcing pending and CAS.
- Audit RED: focused pgTAP failed `audit ordering advances within a transaction` (1/95 failed), demonstrating the existing transaction-constant audit default. The trigger now supplies `clock_timestamp()`; focused and full DB suites pass.
- Browser RED: the old built app lacked the edit link. After implementation, browser evidence showed the save actually persisted but revision-keyed remounting erased the success state. Removed that unnecessary key; the real save feedback now passes. A subsequent assertion used the wrong existing Korean moderation label; it now checks the existing `검수 대기` label.
- Real concurrency GREEN: one independent psql session invokes owner close and keeps its job lock uncommitted. A second authenticated seeker INSERT is observed in `pg_stat_activity` waiting on a Lock. After close commits, INSERT raises `Application not allowed` and no application exists. This checks the actual lock/wakeup path, not a mock or sequential close-then-apply.
- Concurrency mutation RED: temporarily disabled only `applications_guard_admission` on the disposable stack, ran `npm run test:e2e -- tests/e2e/job-lifecycle.spec.ts --grep 'real INSERT'`, and observed the forbidden waiting INSERT succeed (exit code 0), failing the assertion. A Node `finally` restored the trigger. The same real waiter test then passed in targeted and full browser runs. Final count-only inspection confirms the trigger is enabled.
- REST browser checks submit otherwise-valid `posted_at`, `expires_at`, `created_at`, `moderation_status`, `boost='featured'`, and `company_id` changes as the owner and assert SQLSTATE 42501. They also check stale RPC conflict and successful UI resubmission.
- Compatibility corrections: updated the effective application-policy text assertion, API mock shapes, new required timestamp fixtures, and existing B1 local fixtures' expiry. One full-browser run exposed an old shared-fixture test race: the 21 B1 pagination rows could push a seed job off page one. The public smoke test now filters its known seed company; all fourteen browser tests pass concurrently.
- An initial timed-out browser RED skipped cleanup while attempting to navigate its closed page. The test now catches that navigation failure and always performs explicit audit/job/company/user cleanup. Removed the one known aborted local test account using targeted local-only cleanup; final aggregate inspection has zero B2 browser users/jobs/companies.

## Final verification

| Command/check | Result |
| --- | --- |
| `npm test` | exit 0; 51 files, 576 tests passed, 4.68s |
| `npm run test:db` | exit 0; 4 files, 268 assertions passed, including 100 lifecycle assertions |
| `npm test -- tests/job-lifecycle.test.ts tests/db-applications.test.ts tests/db-reports.test.ts` | exit 0; 3 files, 17 tests passed |
| `npm run test:e2e -- tests/e2e/job-lifecycle.spec.ts` | exit 0; 2 tests passed, 3.6s |
| `npm run test:e2e` | exit 0; 14 tests passed, 17.7s |
| `npm run typecheck` | exit 0; no errors |
| `npm run lint` | exit 0; no warnings/errors |
| `npm run build` with isolated public configuration | exit 0; Next 16.3.4 compiled and typed successfully; owned edit route built |
| `git diff --check` | exit 0 |

The final browser output is clean. Earlier browser runs emitted a NO_COLOR/FORCE_COLOR environment warning; the runner removed the conflicting inherited color variables. Existing pgTAP `extension already exists` notices are expected. No credential, token, Auth code, or service-key value was printed. Runtime keys were obtained from local Supabase status in process memory; only public URL/anonymous key went to the app child process, with its service-key variable removed. The unrelated 543xx stack, native 5432, hosted projects, and historical migrations were untouched.

## Hosted inventory and release handling

Hosted inventory is **UNVERIFIED**: no real hosted connection or operator exists in this session. No fabricated backfill, expiry extension, or approved-date assignment was performed. The following is read-only operator preflight, not evidence of a hosted execution:

```sql
select count(*) filter (where moderation_status='approved' and expires_at is null) as approved_without_expiry,
       count(*) filter (where moderation_status in ('pending','draft') and posted_at is not null) as ambiguous_unreviewed_publication
from public.jobs;

select id, company_id, moderation_status, posted_at, expires_at, created_at
from public.jobs
where (moderation_status='approved' and expires_at is null)
   or (moderation_status in ('pending','draft') and posted_at is not null)
order by created_at, id;
```

Have the operator review that exact inventory against real source/owner records. Only a newly confirmed real posting may be approved for a fresh 30-day window through the review path. Unconfirmed approved/null-expiry rows should be paused by a trusted operator; the canonical predicate already keeps them hidden before that status cleanup. Do not infer an actual publication time merely because the old `posted_at DEFAULT now()` populated a field. Preserve known actual approval history; do not fabricate dates for ambiguous legacy rows. D1/C4 must keep this inventory/decision gate open until real operator evidence is available.

Local-only seed data supplies future expiry for its approved rows. Final local aggregate inspection: 11 open jobs, zero approved/null-expiry rows, two intentionally historical pending/draft fixture rows with publication ambiguity, zero B2 browser jobs/companies/users, and admission trigger enabled. This is not hosted evidence.

## Files and self-review

Created migration 00300, `supabase/tests/database/job_lifecycle.test.sql`, the owned edit `page.tsx` and `actions.ts`, `tests/job-lifecycle.test.ts`, and `tests/e2e/job-lifecycle.spec.ts`. Modified the scoped jobs/employer-jobs/admin-moderation/applications/reports/type helpers, shared JobForm, employer/admin job lists and moderation actions/form, local mock/seed fixtures, and directly affected existing unit/DB/browser tests. This report is the implementation evidence artifact.

Self-review read the selected SQL/TypeScript/test diff and checked: lock then auth/revision/matrix/update/audit ordering; fresh post-lock admission snapshot; no REST bypass; monotonic revisions; exact column prefix; B1 view-dependent search/city RPC compatibility; A4 active/AAL2 admin contract and confirmed Auth email in employer application listings; no production mock or service-key app path; form allowlist/full validation; cache refreshes; private note scope; single audit writes; preserved application history; real test cleanup; and no historical migration changes. The requested installed Next 16.3.4 forms, page params, and revalidatePath guides were read before Next changes. Applied TDD, writing-good-tests, systematic debugging, Ponytail, and verification-before-completion guidance.

No implementation correctness blocker remains. B1's previously ledgered maximum-page next-link and invalid direct-RPC-page normalization minors remain deferred: B2 touched only public timestamp mapping and the view predicate, not pagination boundary behavior. C2 should continue from the job-first lock contract when adding suspension ordering; no speculative actor locks were introduced.

Commit subject: `feat: add reviewed job edits closure and moderation history`.

Implementation commit: `21bc927` (`feat: add reviewed job edits closure and moderation history`). The report directory is ignored for new files, so the explicitly requested report is force-added in a separate documentation commit; existing workflow reports use the same tracked directory.
