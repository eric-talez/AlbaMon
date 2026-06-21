# K-Work US — Product Brief

> Source of truth: `docs/K-Work_US_Development_Plan.pdf` (Version 0.1). This file is
> a working summary for engineers. When in doubt, the PDF governs.

## What we are building

K-Work US is a **mobile-first, Korean-English bilingual local hiring marketplace**
for the U.S. Korean community. Initial market: **LA / Orange County**.

It is a lightweight "hiring OS": _post job → apply → message → interview → hired_,
managed in one place — not just a community bulletin board.

**Brand note:** The product name is **K-Work US**. We do **not** use "AlbaMon" or
any confusingly similar brand name anywhere in code or UI (trademark / brand-confusion
risk).

## Positioning (critical)

- Korean-**English bilingual** jobs and Korean/Asian-community-friendly local hiring.
- **NOT** "Korean-only" hiring. Language can be expressed as a **job-related
  requirement** (e.g. "Korean required for customer communication"), never as a
  nationality, ethnicity, citizenship, or immigration-status restriction.

## MVP scope (Must-have)

1. Public job board with filters (city, category, job type, pay, schedule, language).
2. Job detail page with pay range, schedule, location, and a work-authorization
   disclaimer.
3. One-click application for authenticated seekers.
4. Employer onboarding + company profile.
5. Employer job posting with compliance-first validation.
6. Employer dashboard + applicant management.
7. Admin moderation (approve/reject) with safety flags.
8. Reports/blocking, employer verification.
9. Stripe-based featured/urgent boosts.
10. Admin analytics/KPIs.

### Non-goals (MVP)

- Native iOS/Android apps (mobile web first).
- Payroll, background checks, placement success fees.
- Determining an individual's legal work eligibility (we provide general info and
  point students to their DSO only).
- Nationwide expansion before product-market fit.

## Compliance constraints (coded from day one)

| Risk | Product rule |
| --- | --- |
| National-origin discrimination | Block "Korean-only / 한국인만"; allow job-related language requirements. |
| Visa-status preference | Block "OPT only", "H-1B preferred", visa-status gating. |
| Illegal cash pay | Block "under the table", "cash only no tax", "세금 없이". |
| Pay opacity | `pay_min` / `pay_max` required on every job (CA pay transparency). |
| Student work confusion | Disclaimer: platform does not judge work authorization; consult DSO. |
| Privacy | Restrict resume/phone access; honor deletion requests (RLS + privacy settings). |

Standard disclaimers live in `lib/compliance` and on the job-detail / application flow.

## Recommended architecture

- **Frontend/Backend:** Next.js App Router + TypeScript + Tailwind (Server Actions / API routes).
- **DB/Auth/Storage:** Postgres via Supabase (Auth + RLS).
- **Payments:** Stripe Checkout. **Email:** Resend/SendGrid. **SMS (Phase 2):** Twilio.
- **Deploy:** Vercel + Supabase. **Analytics:** PostHog/Plausible or DB aggregation first.

## Roles

`seeker` · `employer` · `admin` — enforced with **server-side** checks (never
client-only) and Supabase RLS.

## Slice plan (one PR per slice)

| # | Slice | Done when |
| --- | --- | --- |
| 0 | Project baseline | App runs locally; lint/typecheck/test scripts exist. |
| 1 | Public shell | Home + jobs list/detail shell render on mobile + desktop (mock data). |
| 2 | Auth & roles | Role-protected routes work; server-side guards. |
| 3 | Database schema | Migrations + seed; only approved jobs are public. |
| 4 | Job browse/search | Filters/sort/pagination; pending jobs never public. |
| 5 | Job detail & apply | One application per seeker/job; duplicate blocked. |
| 6 | Employer onboarding | Only employers create/edit company profile. |
| 7 | Post job | Compliance validation; new jobs pending, not public. |
| 8 | Employer dashboard | Employers see only their own applicants. |
| 9 | Admin moderation | Approve/reject; flagged keywords reach review queue. |
| 10 | Messaging & notifications | Per-application threads; dev-mode email stubs. |
| 11 | Verification & trust | Verified badges; report queue. |
| 12 | Payments & boosts | Stripe checkout activates boost via webhook. |
| 13 | Analytics | Admin KPI dashboard. |
| 14 | Compliance polish | Policy pages, disclaimers, audit logs. |
| 15 | Launch hardening | QA, a11y, SEO, deploy checklist. |

## Current status

- **Slice 0 — Project baseline:** ✅ done.
- **Slice 1 — Public shell:** ✅ done (`/`, `/jobs`, `/jobs/[id]` on mock data;
  header / mobile bottom-nav / footer; job card, filter placeholders, disclaimer).
- **Slice 2 — Auth & roles:** next.
