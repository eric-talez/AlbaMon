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
`moderation_status`, `boost_type` — values match the const arrays in
`src/lib/types.ts` exactly.

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
| `audit_logs` | Append-only audit trail. | No `updated_at`; writes via service-role only. |

`public_job_listings` is a read-only, approved-only view used by public job
pages. It includes job fields plus `company_name` / `company_is_verified`, but
does not expose private company profile columns.

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
  already-decided request returns `conflict`.

## Row Level Security summary

RLS is enabled on **all eight tables** and is the authorization gate.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | self; admin all | self-update only, and **role cannot change** (RLS pins it + a `before update of role` trigger hard-blocks non-admins); admin all |
| `companies` | verified (public); current-role owner; admin | owner insert/update own — **requires employer or admin role**; admin all |
| `jobs` | **`approved` only (public)**; current-role owner; admin | employer/admin owner insert **forced to `pending`**; owner update cannot set `approved`; admin all |
| `applications` | own (seeker); current-role employer for owned jobs; admin | insert only by a **`seeker`-role profile**, as self, for `approved` jobs with initial status `submitted`; current-role owning employers may update status only; admin update |
| `messages` | applicant; current-role owning employer; admin | applicant/owning employer insert only as `auth.uid()`; no update/delete |
| `reports` | own (reporter); admin | authenticated reporter insert for approved jobs only; admin status update |
| `employer_access_requests` | own (requester); admin all | requester insert only as self while runtime role is **`seeker`**, initial `pending` state with empty review fields; **no update/delete policy** — decisions go only through `review_employer_access_request()` |
| `audit_logs` | admin only | **no policy** — service-role only |

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

Slice 12 uses the existing nullable `jobs.boost` field for paid visibility
boosts. User-facing checkout creation uses the caller-authenticated Supabase
session only to verify job/company ownership and never changes `jobs.boost`.
The Stripe webhook verifies `STRIPE_WEBHOOK_SECRET` before using the service-role
client to set the intended job's boost by both `job_id` and `company_id`.
No payments table, subscription schema, refund tooling, or billing portal schema
is introduced in this slice.

Admin moderation uses the same cookie-authenticated client through
`src/lib/db/admin-moderation.ts`. Existing admin RLS permits the required reads
and narrow updates, so Slice 8 adds no migration. Job decisions filter by both
job ID and current `pending` status; approval updates status and `posted_at`,
rejection updates status only, and company verification updates only
`is_verified`. Owner profile lookups select only ID, display name, and email.

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
actions update only open report status to `reviewed` or `dismissed`; they do not
reject jobs, suspend accounts, send email, or expand audit logs.

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
so approval (request status + `profiles.role` promotion to `employer`) is
atomic, rejection changes no role, and requesters can never approve
themselves. Approval does **not** create a company: the new employer still
registers company details and submits jobs through the existing flow, and
public job visibility remains approved-only. K-Work US does not verify or
guarantee business registration, legal status, or work authorization as part
of this review.

## Known limitations

- Runtime auth reads `profiles.role`; missing/error profile reads fail closed.
- Employer job editing is not implemented. Admin job moderation is pending-only
  and does not collect a rejection reason.
- Message delivery is in-app only. Development notification stubs do not send
  production email or persist notification preferences.
- Report review is a queue-status workflow only; blocking, sanctions, email
  alerts, and full trust-and-safety case management are deferred.
- Boost payment records, refunds, subscriptions, invoices, billing portal,
  coupons, payouts, taxes, and payment analytics are deferred.
- Application dashboard reads are unavailable rather than mocked when Supabase
  is not configured.
- Seed uses fixed UUIDs and inserts into `auth.users`; intended for local/demo
  use, not production data.
- RLS behavior is covered by static migration tests; a live Supabase policy
  integration suite is still recommended before production launch.
