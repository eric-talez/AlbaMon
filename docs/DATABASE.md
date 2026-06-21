# Database — K-Work US (Slice 3)

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

Without the CLI, paste `migrations/20260621000000_init_schema.sql` then
`seed.sql` into the Supabase SQL editor.

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
| `applications` | Seeker applications. | `unique(job_id, seeker_id)` blocks duplicates. |
| `reports` | Abuse/quality reports. | Nullable `reporter_id`/`job_id`/`company_id`. |
| `audit_logs` | Append-only audit trail. | No `updated_at`; writes via service-role only. |

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

## Row Level Security summary

RLS is enabled on **all six tables** and is the authorization gate.

| Table | Read | Write |
| --- | --- | --- |
| `profiles` | self; admin all | self-update only, and **role cannot change** (pinned to current role); admin all |
| `companies` | verified (public); owner; admin | owner insert/update own; admin all |
| `jobs` | **`approved` only (public)**; owner; admin | owner insert **forced to `pending`**; owner update but **cannot set `approved`**; admin all |
| `applications` | own (seeker); employer for their jobs; admin | seeker insert only for `approved` jobs, as self; admin update |
| `reports` | own (reporter); admin | any authenticated insert; admin update |
| `audit_logs` | admin only | **no policy** — service-role only |

## App access layer

[`src/lib/db/jobs.ts`](../src/lib/db/jobs.ts) exposes `getApprovedJobs()` and
`getApprovedJobById(id)`:

- **Supabase not configured** (default in dev/test/build) → returns mock data
  from `src/lib/mock/jobs.ts`.
- **Configured** → queries the DB (joining the company), filtering
  `moderation_status = 'approved'` as defense in depth beyond RLS, and maps rows
  to the camelCase `Job` view type. Query errors log and fall back to mock; the
  public path never throws.

## Known limitations

- Runtime auth still reads the role from Supabase `user_metadata`/dev-auth, not
  `profiles`. The table + helpers + RLS are ready; switching `getCurrentUser()`
  to `profiles` is deferred to the next slice (needs a live Supabase project to
  verify the auth hot path).
- No employer posting, application submit, or admin moderation UI yet — only the
  read path is wired.
- Seed uses fixed UUIDs and inserts into `auth.users`; intended for local/demo
  use, not production data.
