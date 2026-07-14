# Database — K-Work US (Slices 3–4.5)

The Postgres schema is defined by SQL migrations under
[`supabase/migrations/`](../supabase/migrations/), which are the **source of
truth**. The app layer mirrors—but never redefines—the enum values; the SQL
enums are checked against `src/lib/types.ts` in `tests/db-schema.test.ts`.

## Applying migrations & seed

See [`supabase/README.md`](../supabase/README.md). In short:

```bash
supabase start      # local Postgres + auth (Docker)
supabase db reset   # apply migrations/ then seed.sql from scratch
# hosted: supabase link --project-ref <ref> && supabase db push
```

Without the CLI, run every file in `migrations/` in filename order, then run
`seed.sql` in the Supabase SQL editor.

## Enums

`user_role`, `job_type`, `pay_unit`, `language_requirement`, `job_category`,
`moderation_status` — values match the const arrays in `src/lib/types.ts`
exactly. `boost_type` (`featured`, `urgent`) remains in SQL but has no app
constant since Slice 23 de-scoped paid boosts; `tests/db-schema.test.ts` pins
its values.

## Tables

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | One row per `auth.users` user; DB-level source of truth for role. | Auto-created by the `on_auth_user_created` trigger (defaults to `seeker`). |
| `companies` | Employer companies. | `owner_id → profiles`; `is_verified` gates public visibility. |
| `jobs` | Job postings. | `company_id → companies`; `moderation_status` gates public visibility; `address_display_mode` is `full`/`city_only`. |
| `applications` | Seeker applications. | `unique(job_id, seeker_id)` blocks duplicates; optional `cover_note` is limited to 1,000 characters; `status` is constrained to the Slice 10 workflow values. |
| `messages` | Application-centered seeker/employer conversations. | `application_id → applications`; body is nonblank and limited to 2,000 characters. |
| `reports` | Abuse/quality reports. | Job reports filed by signed-in users; reason/status/details are constrained by Slice 11. |
| `employer_access_requests` | Seeker requests for the employer role (Slice 21). | `requester_id → profiles`; status is `pending`/`approved`/`rejected`; a partial unique index allows **one pending request per requester**; decided rows carry `reviewed_by`/`reviewed_at`. |
| `audit_logs` | Append-only audit trail of admin moderation decisions (Slice 27). | No `updated_at`; rows are written only by the admin-only `security definer` review functions, atomically with each decision; an append-only trigger rejects `UPDATE`/`DELETE` from the ordinary API roles. |

`public_job_listings` is a read-only, approved-only view used by public job
pages. It includes job fields plus `company_name` / `company_is_verified`, but
does not expose private company profile columns. Since Slice 25 it is the
**only** public path to company identity: `anon` and ordinary seeker callers
cannot read the `companies` base table at all (no anon grant, no public SELECT
policy), so private columns such as `phone`, `address_display`, `website`, and
`owner_id` are never reachable through PostgREST. The view runs with its
owner's rights, so it is unaffected by the base-table grant/policy changes.

Constraints: `pay_min >= 0`, `pay_max >= pay_min`, non-empty `jobs.title`,
`companies.name`, `jobs.description`. Indexes cover the public query
(`jobs(moderation_status, posted_at)`), filters (`jobs(city, category,
job_type)`), ownership (`companies(owner_id)`), application lookups, report
status, and audit-log scans.

## Helper functions

All are `security definer` + `stable` (so they bypass RLS when called from a
policy, preventing recursion) with a pinned `search_path`:

- `current_profile_role()` → caller's `user_role`
- `is_admin()` / `is_employer()` → boolean
- `owns_company(company_id uuid)` → boolean
- `handle_new_user()` → trigger that auto-provisions a `profiles` row on signup
- `prevent_profile_role_self_update()` → `before update of role on profiles`
  trigger; hard-blocks any role change by a non-admin (defense in depth beyond
  the RLS `WITH CHECK`). Admins may still change roles, and trusted server-side
  flows (service role / migrations / seed, where `auth.uid()` is null) pass through.
- `review_employer_access_request(request_id uuid, decision text)` → Slice 21
  admin-only `security definer` function (empty pinned `search_path`, execute
  revoked from `anon`). Raises unless the caller's runtime role is `admin`;
  approves/rejects a **pending** request, stamps `reviewed_by`/`reviewed_at`,
  and on approval promotes the requester's `profiles.role` from `seeker` to
  `employer` in the same transaction. Rejection never changes any role, and an
  already-decided request returns `conflict`. Since Slice 27 the same
  transaction also inserts one `employer_access.approved`/`.rejected`
  `audit_logs` row (with a `role_promoted` flag).
- `moderate_pending_job(job_id uuid, decision text)`,
  `set_company_verification(company_id uuid, verified boolean)`, and
  `review_report(report_id uuid, decision text)` → Slice 27 admin-only
  `security definer` mutations (empty pinned `search_path`, execute revoked
  from `public`/`anon`, granted only to `authenticated`). Each requires a
  non-null `auth.uid()` plus `is_admin()`, validates the requested decision,
  locks the target row with `FOR UPDATE`, applies the entity change, and
  inserts exactly one `audit_logs` row — all in one transaction. Stale or
  repeated requests (and a company already in the requested verification
  state) return `conflict` and write nothing. Job approval stamps `posted_at`
  with `now()` inside Postgres.
- `prevent_audit_log_mutation()` → `before update or delete on audit_logs`
  trigger (Slice 27). SECURITY INVOKER on purpose: it keys on role identity
  (`current_user`) and rejects the row change (42501) when the session runs as
  an **ordinary API role** — `anon` or `authenticated` (admins included, since
  admins act through `authenticated`). Those roles already hold no
  UPDATE/DELETE grants on `audit_logs`, so the trigger is defense-in-depth
  should grants or RLS ever drift. Trusted maintenance is untouched: owner
  migrations, SQL-editor sessions, restores, `service_role` operational
  repair, and the `actor_id` `ON DELETE SET NULL` cascade (referential actions
  run as the table owner) all pass, so account-deletion flows keep working.

## Row Level Security summary

RLS is enabled on **all eight tables** and is the authorization gate.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | self; admin all | self-update only, and **role cannot change** (RLS pins it + a `before update of role` trigger hard-blocks non-admins); admin all |
| `companies` | current-role owner; admin (**no public/seeker base-table read** — Slice 25 dropped `companies_select_public_verified`; the public sees company identity only through `public_job_listings`) | owner insert/update own — **requires employer or admin role**; admin all |
| `jobs` | **`approved` only (public)**; current-role owner; admin | employer/admin owner insert **forced to `pending`**; owner update cannot set `approved`; admin all |
| `applications` | own (seeker); current-role employer for owned jobs; admin | insert only by a **`seeker`-role profile**, as self, for `approved` jobs with initial status `submitted`; current-role owning employers may update status only; admin update |
| `messages` | applicant; current-role owning employer; admin | applicant/owning employer insert only as `auth.uid()`; no update/delete |
| `reports` | own (reporter); admin | authenticated reporter insert for approved jobs only; admin status update |
| `employer_access_requests` | own (requester); admin all | requester insert only as self while runtime role is **`seeker`**, initial `pending` state with empty review fields; **no update/delete policy** — decisions go only through `review_employer_access_request()` |
| `audit_logs` | admin only | **no policy** — inserts happen only inside the Slice 27 admin `security definer` review functions (owner rights); the `audit_logs_prevent_mutation` trigger backstops update/delete against the ordinary API roles (owner/service_role maintenance passes) |

## Table grants (Supabase API roles)

Current Supabase projects (and current CLI local stacks) apply **no implicit
table privileges** to the API roles `anon`, `authenticated`, and
`service_role`: tables created by migrations start with no
SELECT/INSERT/UPDATE/DELETE for them. The Slice 3 schema predated that change,
so before `20260707000000_explicit_table_grants.sql` every real sign-in
(social or phone OTP) minted a valid session and then **failed closed at the
`profiles.role` lookup** — `permission denied for table profiles` (42501) —
bouncing the user back to `/login` on every provider.

That migration adds deterministic, least-privilege **table-level** grants
(revoke-then-grant, so projects created under the legacy implicit defaults
end up identical):

- `anon` — SELECT on `jobs` only (RLS limits rows to `approved`); **no grant
  on `companies`** (revoked in `20260713000000_restrict_company_public_reads.sql`,
  Slice 25 — public company identity comes only through `public_job_listings`);
  nothing on any other table.
- `authenticated` — SELECT/INSERT/UPDATE matching the policy matrix above,
  never DELETE. No INSERT on `profiles` (rows are provisioned only by the
  security-definer `on_auth_user_created` trigger) and no UPDATE on
  `employer_access_requests` (decisions go through
  `review_employer_access_request()`).
- `service_role` — full DML restored on all app tables (trusted server-side
  key; bypasses RLS by design).

`messages` and the `public_job_listings` view already carried explicit grants
from earlier migrations and are unchanged. **RLS remains the row-level
authorization gate on every table** — the grants are the table-level floor,
the policies filter the rows. `tests/db-schema.test.ts` ("explicit table
grants for API roles") pins the grant surface.

`20260713000000_restrict_company_public_reads.sql` (Slice 25) then tightens the
`companies` base table: it drops the `companies_select_public_verified` policy
and revokes the `anon` SELECT grant, so verification alone no longer exposes a
company's base row to the public or to unrelated seekers. Employers still read
their own company (`companies_select_owner`), admins read all
(`companies_select_admin`), and public company identity is served exclusively by
`public_job_listings`. The `authenticated` grant is retained so the owner/admin
policies can still return rows.

## App access layer

[`src/lib/db/applications.ts`](../src/lib/db/applications.ts) creates applications
through the caller's authenticated Supabase session. It does not accept a status
or use a service-role client. Duplicate, RLS, and foreign-key failures are mapped
to safe application outcomes; unconfigured environments never perform mock
writes.

Slice 10 adds the application status workflow. Supported statuses are
`submitted`, `reviewing`, `interview`, `offered`, `rejected`, and `withdrawn`.
The `applications_status_allowed` check constraint enforces that set. Owning
employers can update only the `status` column for applications on jobs under
their companies through the caller-authenticated client; seekers have no update
policy, and admins continue to use the existing admin policy. The
`prevent_application_employer_field_change()` trigger blocks normal authenticated
users from changing job ownership, applicant identity, cover notes, or timestamps.
No service-role client or mock status write is used for user-facing changes.

The same module reads application dashboards through the parameterless
`list_seeker_applications()` and `list_employer_applications()` RPCs. Both are
`security definer` functions with an empty pinned `search_path`, derive identity
from `auth.uid()`, and re-check the caller's runtime `profiles.role`. The seeker
function returns only the caller's submissions. The employer function returns
only applications for jobs under caller-owned companies and exposes only the
applicant's `display_name` and `email`. Default execution is revoked before
`authenticated` receives execute access; profile RLS remains unchanged.

[`src/lib/db/jobs.ts`](../src/lib/db/jobs.ts) exposes `getApprovedJobs()`,
`getApprovedJobById(id)`, and `searchApprovedJobs(params)`:

- **Development/test/production build without Supabase** → deterministic mock
  data from `src/lib/mock/jobs.ts`.
- **Production runtime without Supabase, or with a DB failure** → throws instead
  of silently presenting fictional listings.
- **Configured** → queries `public_job_listings`, filters approved rows again as
  defense in depth, and maps rows to the camelCase `Job` type.

Employer company and job writes use the caller's cookie-authenticated Supabase
client through `src/lib/db/companies.ts` and `src/lib/db/employer-jobs.ts`.
Server Actions derive ownership from the verified session, re-check selected
company ownership, and submit jobs only as `pending` with a null boost. No
service-role client or mock persistent write is used.

The Slice 7 hardening migration forces employer company inserts to remain
unverified and employer job inserts to remain unboosted. Pinned-search-path
triggers prevent normal users changing `is_verified` or `boost`, while allowing
admin, service-role, and trusted migration/database execution.

Payments and paid boosts were de-scoped from the MVP in Slice 23; the
`jobs.boost` column, enum, and write-protection triggers remain in the schema,
intentionally unused (no app code selects or displays the column; employer
inserts still set it to an explicit `null` to match the insert policy). No
payments table, subscription schema, refund tooling, or billing portal schema
exists.

Admin moderation reads use the same cookie-authenticated client through
`src/lib/db/admin-moderation.ts`; existing admin RLS permits them. Since
Slice 27 the **writes** no longer touch tables directly: job decisions call
`moderate_pending_job()` and company verification calls
`set_company_verification()`, so each decision and its `audit_logs` entry
commit or roll back together. Only a `pending` job can be moderated (approval
stamps `posted_at` via `now()` in Postgres, rejection changes status only),
and a company already in the requested verification state returns `conflict`
without writing anything. The actor recorded on every audit row is
`auth.uid()` — never a client-supplied value. Owner profile lookups select
only ID, display name, and email.

Application messages use `src/lib/db/messages.ts` and the Slice 9
`can_access_application_thread(uuid)` helper. The helper derives identity and
runtime role from the authenticated database session, and permits only the
applicant, owning employer, or admin to read a thread. Insert RLS additionally
requires a seeker/employer participant and pins `sender_id` to `auth.uid()`.
The thread-context RPC exposes only application/job/company display fields.

Report submission and the admin report queue use
[`src/lib/db/reports.ts`](../src/lib/db/reports.ts). Users can file reports only
through their caller-authenticated Supabase session. The app verifies the job via
the approved-only `public_job_listings` view before inserting, and Slice 11 RLS
keeps approved jobs as the final insert gate. Reports are constrained to the
reason set `discriminatory_language`, `visa_status_preference`,
`illegal_cash_pay`, `misleading_or_suspicious`, `spam`, and `other`; status is
constrained to `open`, `reviewed`, or `dismissed`; details are capped at 1,000
characters; and a unique index prevents the same signed-in user from repeatedly
reporting the same job with the same reason.

Admin report queue reads use existing admin RLS and narrow follow-up reads for
job title/status, company name, and reporter display name/email only. Admin
decisions call the Slice 27 `review_report()` function: only an `open` report
can move to `reviewed` or `dismissed`, the decision writes one
`report.reviewed`/`report.dismissed` audit row in the same transaction, and a
stale/repeated request returns `conflict` and writes nothing. Report free-text
`details` never enter audit metadata. Admin actions still do not reject jobs,
suspend accounts, or send email.

Employer access requests (Slice 21) use
[`src/lib/db/employer-access-requests.ts`](../src/lib/db/employer-access-requests.ts).
Real auth users start as `seeker`; the employer role is granted only through
admin approval of a request filed at `/employer/request-access`. The
user-facing flow runs entirely through the caller-authenticated Supabase
session — no service-role client and no mock persistent writes; unconfigured
environments show a setup-required state. Inserts rely on the seeker-only
self-insert RLS policy, and duplicate open requests surface as
`duplicate_pending` via the partial unique index. Admin review at
`/admin/employer-requests` calls the `review_employer_access_request()` RPC,
so approval (request status + `profiles.role` promotion to `employer` + the
`audit_logs` entry since Slice 27) is atomic, rejection changes no role, and
requesters can never approve themselves. Approval does **not** create a company: the new employer still
registers company details and submits jobs through the existing flow, and
public job visibility remains approved-only. K-Work US does not verify or
guarantee business registration, legal status, or work authorization as part
of this review.

## Admin audit trail (Slice 27)

Every admin moderation decision writes exactly one `audit_logs` row inside the
same database transaction as the entity change. The stable action taxonomy:

| Action | Entity (`entity_type` / `entity_id`) | Metadata keys |
| --- | --- | --- |
| `job.approved` / `job.rejected` | `job` / job id | `decision`, `from_status`, `to_status` |
| `company.verified` / `company.unverified` | `company` / company id | `from_verified`, `to_verified` |
| `report.reviewed` / `report.dismissed` | `report` / report id | `from_status`, `to_status` |
| `employer_access.approved` / `employer_access.rejected` | `employer_access_request` / request id | `decision`, `requester_id`, `from_status`, `to_status`, `role_promoted` |

Guarantees:

- `actor_id` is always `auth.uid()` captured inside Postgres; callers cannot
  supply actor, action, entity, or metadata values (there is no generic
  audit-write RPC).
- Conflicts, validation failures, and unauthorized calls return/raise **before**
  the audit insert, so they never leave rows behind; if the audit insert itself
  fails, the entity mutation rolls back with it.
- Metadata is minimal and structured — statuses, booleans, and ids only. No
  emails, phone numbers, addresses, report details, job descriptions, or
  request notes are recorded.
- Rows are append-only for ordinary API roles: authenticated clients hold only
  the SELECT grant (admin-filtered by RLS), and the
  `audit_logs_prevent_mutation` trigger backstops UPDATE/DELETE for
  `anon`/`authenticated` even if that grant surface ever drifts. Trusted
  maintenance — owner sessions, `service_role`, restores, and the `actor_id`
  FK cascade — is deliberately exempt.
- The admin dashboard's recent-activity section reads the newest rows and maps
  these actions to Korean-first labels; unknown actions render raw rather than
  hiding.

Static coverage lives in `tests/admin-audit-migration.test.ts`; live coverage
in `supabase/tests/slice-27-admin-audit-writes.sql` (disposable local stack
only).

## Known limitations

- Runtime auth reads `profiles.role`; missing/error profile reads fail closed.
- Employer job editing is not implemented. Admin job moderation is pending-only
  and does not collect a rejection reason.
- Message delivery is in-app only. Development notification stubs do not send
  production email or persist notification preferences.
- Report review is a queue-status workflow only; blocking, sanctions, email
  alerts, and full trust-and-safety case management are deferred.
- Payments and paid boosts were de-scoped from the MVP in Slice 23; the
  `jobs.boost` column, enum, and write-protection triggers remain in the
  schema, intentionally unused. Revisit post-beta.
- Application dashboard reads are unavailable rather than mocked when Supabase
  is not configured.
- Seed uses fixed UUIDs and inserts into `auth.users`; intended for local/demo
  use, not production data.
- RLS behavior is covered by static migration tests; a live Supabase policy
  integration suite is still recommended before production launch.
