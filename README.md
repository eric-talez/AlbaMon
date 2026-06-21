# K-Work US

Korean-English **bilingual** local hiring marketplace for the U.S. Korean
community. Mobile-first. Initial market: **LA / Orange County**.

> Positioning: bilingual / community-friendly local jobs — **not** Korean-only
> hiring. See [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md) and the full plan in
> [`docs/K-Work_US_Development_Plan.pdf`](docs/K-Work_US_Development_Plan.pdf).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4**
- **Vitest** for unit tests
- Planned: Supabase (Auth + Postgres + RLS), Stripe Checkout, Resend/SendGrid

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
    ...                 # site config, types, mock data (db/validation/compliance later)
  proxy.ts              # Next 16 "proxy" (renamed middleware): Supabase session refresh
tests/                 # Vitest unit tests
docs/                  # PRODUCT_BRIEF, development plan, policies
supabase/migrations/   # DB migrations (added in Slice 3)
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

## Development approach

Work is delivered in small, reviewable **slices** (one PR each), Slice 0 → 15.
See the slice table in [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## Compliance

Employment-compliance rules are enforced in code (`lib/compliance`, added in later
slices): blocked discriminatory / visa-preference / illegal-cash phrasing, required
pay range, and work-authorization disclaimers. The platform provides **information
only** and does not give legal advice or determine work eligibility.
