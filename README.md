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
  lib/                 # site config, db, auth, validation, compliance (added per slice)
tests/                 # Vitest unit tests
docs/                  # PRODUCT_BRIEF, development plan, policies
supabase/migrations/   # DB migrations (added in Slice 3)
```

## Development approach

Work is delivered in small, reviewable **slices** (one PR each), Slice 0 → 15.
See the slice table in [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## Compliance

Employment-compliance rules are enforced in code (`lib/compliance`, added in later
slices): blocked discriminatory / visa-preference / illegal-cash phrasing, required
pay range, and work-authorization disclaimers. The platform provides **information
only** and does not give legal advice or determine work eligibility.
