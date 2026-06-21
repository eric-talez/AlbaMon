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
| `applications` | Seeker applications. | `unique(job_id, seeker_id)` blocks duplicates; optional `cover_note` is limited to 1,000 characters. |
| `reports` | Abuse/quality reports. | Nullable `reporter_id`/`job_id`/`company_id`. |
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

## Row Level Security summary

RLS is enabled on **all six tables** and is the authorization gate.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | self; admin all | self-update only, and **role cannot change** (RLS pins it + a `before update of role` trigger hard-blocks non-admins); admin all |
| `companies` | verified (public); current-role owner; admin | owner insert/update own — **requires employer or admin role**; admin all |
| `jobs` | **`approved` only (public)**; current-role owner; admin | employer/admin owner insert **forced to `pending`**; owner update cannot set `approved`; admin all |
| `applications` | own (seeker); current-role employer for owned jobs; admin | insert only by a **`seeker`-role profile**, as self, for `approved` jobs with initial status `submitted`; admin update |
| `reports` | own (reporter); admin | any authenticated insert; admin update |
| `audit_logs` | admin only | **no policy** — service-role only |

## App access layer

[`src/lib/db/applications.ts`](../src/lib/db/applications.ts) creates applications
through the caller's authenticated Supabase session. It does not accept a status
or use a service-role client. Duplicate, RLS, and foreign-key failures are mapped
to safe application outcomes; unconfigured environments never perform mock
writes.

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

## Known limitations

- Runtime auth reads `profiles.role`; missing/error profile reads fail closed.
- Application status transitions, employer posting, and admin moderation UI are
  not yet implemented.
- Application dashboard reads are unavailable rather than mocked when Supabase
  is not configured.
- Seed uses fixed UUIDs and inserts into `auth.users`; intended for local/demo
  use, not production data.
- RLS behavior is covered by static migration tests; a live Supabase policy
  integration suite is still recommended before production launch.
