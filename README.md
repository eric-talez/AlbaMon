# K-Work US

Korean-English **bilingual** local hiring marketplace for the U.S. Korean
community. Mobile-first. Initial market: **LA / Orange County**.

> Positioning: bilingual / community-friendly local jobs — **not** Korean-only
> hiring. See [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md) and the full plan in
> [`docs/K-Work_US_Development_Plan.pdf`](docs/K-Work_US_Development_Plan.pdf).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4**
- **Supabase Auth + Postgres + Row Level Security**
- **Vitest** for unit tests
- Planned: Stripe Checkout, Resend/SendGrid

## Local setup

Requirements: Node.js 20+, npm 10+.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (placeholders are fine to start the UI)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm run start` | Run the production build. |
| `npm run lint` | ESLint (Next.js config). |
| `npm run typecheck` | TypeScript `--noEmit` strict check. |
| `npm test` | Run unit tests once (Vitest). |
| `npm run test:watch` | Watch-mode tests. |

## Project structure

```
src/
  app/                 # App Router routes (public, auth, employer, admin)
  components/           # UI + auth components
  lib/
    auth/               # roles, permission matrix, server-side guards, sessions
    supabase/           # browser/server clients + proxy session helper
    db/                 # DB row types + approved-job reads (mock fallback)
    ...                 # site config, types, mock data (validation/compliance later)
  proxy.ts              # Next 16 "proxy" (renamed middleware): Supabase session refresh
tests/                 # Vitest unit tests
docs/                  # PRODUCT_BRIEF, DATABASE.md, development plan, policies
supabase/
  migrations/           # DB schema + RLS (source of truth)
  seed.sql              # LA/OC demo companies + jobs
```

## Auth & roles (Slice 2)

Three roles: **seeker**, **employer**, **admin**. Authorization is enforced
**server-side** — the central permission matrix lives in
[`src/lib/auth/access.ts`](src/lib/auth/access.ts) and guards in
[`src/lib/auth/guards.ts`](src/lib/auth/guards.ts) redirect unauthenticated users
to `/login` and wrong-role users to `/forbidden`. UI checks are never the only
protection.

| Area | Allowed roles |
| --- | --- |
| `/dashboard` | any signed-in user |
| `/employer/**` | employer, admin |
| `/admin/**` | admin only |

**Dev-auth mode:** with the placeholder Supabase values in `.env.example`, the app
runs in a cookie-based **dev-auth mode** — open `/login`, pick a role, and the
guards behave as in production. Fill in real `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` to switch to real Supabase auth. No secrets are
committed.

## Database (Slice 3)

The Postgres schema lives in [`supabase/`](supabase/) and is the source of truth:
enums, the six core tables (`profiles`, `companies`, `jobs`, `applications`,
`reports`, `audit_logs`), constraints, an `updated_at` trigger, authorization
helper functions, and **Row Level Security** on every table. See
[`docs/DATABASE.md`](docs/DATABASE.md) for the full schema + RLS summary and
[`supabase/README.md`](supabase/README.md) for how to apply migrations and seed.

```bash
supabase db reset   # apply migrations/ + seed.sql to a local DB (CLI + Docker)
```

**Mock fallback:** the public job pages read through
[`src/lib/db/jobs.ts`](src/lib/db/jobs.ts) (`getApprovedJobs` /
`getApprovedJobById` / `searchApprovedJobs`). When Supabase is **not** configured
in development, tests, or `next build`, they return deterministic mock data. A
production runtime never substitutes mock listings for missing configuration or
a DB outage; those errors are surfaced instead. Configured reads use the
approved-only `public_job_listings` view, which exposes safe company identity
without making the rest of an unverified company profile public.

## Browse, search & roles (Slice 4)

**DB-backed browse/search.** `/jobs` is a server-rendered page driven by URL query
params. [`src/components/JobFilters.tsx`](src/components/JobFilters.tsx) is a plain
**GET form** (works without JavaScript) that submits `q`, `city`, `category`,
`jobType`, `languageRequirement`, `payMin`, and `sort` (`newest` | `pay_high` |
`pay_low`). `searchApprovedJobs()` applies these filters against the DB when
Supabase is configured and against the mock data otherwise — always approved-only,
so pending/draft/rejected jobs are never exposed. Invalid query values are ignored
safely (`parseJobSearchParams`), and a **필터 초기화 / Reset** link clears them.

**Runtime role source is now `profiles.role`.** When Supabase is configured,
`getCurrentUser()` ([`src/lib/auth/session.ts`](src/lib/auth/session.ts)) verifies
the user with `supabase.auth.getUser()` and then reads the role from the
`profiles` table via [`src/lib/db/profiles.ts`](src/lib/db/profiles.ts). The
client-influenced `user_metadata.role` is **no longer trusted** for authorization.
A Supabase-authenticated user **without a profile row fails closed** (treated as
unauthenticated until the profile exists). Dev-auth (Supabase unconfigured,
non-production) is unchanged, as is the Slice 2 production fail-closed behavior.

Owner RLS policies also require the caller's current `employer`/`admin` profile
role. Removing an employer role therefore revokes private company/job/applicant
access even if the old company ownership row remains.

> Not yet built: application submission, employer job-posting, and admin
> moderation UIs. The recommended next slice is the **job-seeker application
> submission flow** (writing to `applications` under the existing RLS).

## Development approach

Work is delivered in small, reviewable **slices** (one PR each), Slice 0 → 15.
See the slice table in [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## Compliance

Current controls require pay ranges in the schema and show work-authorization
disclaimers. Automated discriminatory / visa-preference / illegal-cash wording
validation is planned for a later compliance slice. The platform provides
**information only** and does not give legal advice or determine work eligibility.
