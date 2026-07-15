# Beta Readiness Runbook — K-Work US

How to verify, in order, that a deployed K-Work US instance is ready for the
first small private beta (LA/OC). Companion docs:
[`DEPLOYMENT.md`](DEPLOYMENT.md) is *how to set everything up*,
[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) is *what must be true* (and the
sign-off of record), [`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md) is the
per-variable environment reference,
[`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md) is the post-deploy health and
incident runbook, and `npm run verify:beta` is the automated docs gate. This
runbook adds execution order, exact queries, and pass criteria — it does not
restate those documents.

## 1. Purpose

This runbook takes a **deployed** instance to a **go/no-go decision** (§16)
for inviting the first private-beta users. Work the sections in order; each
ends with pass criteria. It prepares and verifies the launch process — it does
not perform the launch.

> **Disclaimers.** This runbook is an operational checklist and **not a
> substitute for attorney review** — the in-app policy copy is still
> placeholder text pending that review (see
> [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md), "Legal & compliance copy").
> Nothing in this document or in the product is
> **legal, tax, immigration, or employment advice**.

Hard gates this runbook enforces:

- Private beta can proceed **only if** production contains **no seed/demo
  users, companies, jobs, applications, messages, or reports** (§6).
- `draft`, `pending`, `rejected`, `paused`, and `expired`-status jobs must never
  be publicly visible, and neither may an `approved` job past its `expires_at` —
  only `approved` **and unexpired** jobs are (§9).
- Service-role usage stays restricted to trusted server flows — its only app
  consumer is the Slice 28 rate limiter's private `consume_rate_limit` RPC,
  never OTP send/verify and never a business mutation (§3).
- Payments and paid boosts are out of the MVP (de-scoped in Slice 23; §8).
- Browser E2E covers the credential-free Chromium/dev-auth surface (Slice 30,
  §15); the role smoke tests below still cover the real-Supabase and provider
  flows that E2E does not.

## 2. Required preconditions

- [ ] Latest `main` is deployed and CI is green on the release commit
      ([`../.github/workflows/ci.yml`](../.github/workflows/ci.yml); see the
      README "Continuous integration" section).
- [ ] `npm run verify:beta` passes on the release commit (offline docs gate).
- [ ] Local Supabase rehearsal completed per [`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md):
      migrations + seed applied, auth mode and guard behavior smoked, and the
      admin-promotion SQL practiced against a disposable local stack.
- [ ] Access on hand: Vercel project, Supabase dashboard + SQL editor, and the
      production URL.
- [ ] Two disposable, team-owned test inboxes (employer + seeker accounts for
      §10–§13), clearly identifiable so their data can be attributed in §6.
- [ ] A named owner for the go/no-go call (§16) and for post-launch log checks
      ([`LAUNCH_CHECKLIST.md §8`](LAUNCH_CHECKLIST.md#8-monitoring--operations)).

## 3. Production environment setup checklist

Set values per [`PRODUCTION_ENV_VARS.md`](PRODUCTION_ENV_VARS.md) (the
per-variable reference) using the Vercel procedure in
[`DEPLOYMENT.md §4`](DEPLOYMENT.md#4-vercel).

- [ ] Every **Required** variable is set in Vercel **Production** scope;
      deferred ones left unset/empty.
- [ ] No value still contains a placeholder fragment (`your-project`,
      `your-anon-key`, `example`, `xxx`, `placeholder`,
      `generate-with-openssl`) — the app treats those as unconfigured.
- [ ] No secret has a `NEXT_PUBLIC_` name. The service-role key is server-only;
      its only app consumer is the Slice 28 rate limiter (private
      `consume_rate_limit` RPC), and `/api/health` reports its presence.
- [ ] Redeployed after the last env change (edits do not apply to the running
      deployment).
- [ ] `GET /api/health` on the production URL returns 200 with
      `siteUrl`/`supabase`/`rateLimit` = `configured` and `email`/`analytics` =
      `deferred` (statuses reference:
      [`OPERATIONAL_HEALTH.md §2`](OPERATIONAL_HEALTH.md#2-get-apihealth-reference)).
      Any `missing`/`partial` = this section is not done.

Pass: the health check above is green, production `/` renders with real auth
(no fail-closed configuration error in Vercel function logs), and page source
contains no `sk_`, `whsec_`, or service-role values.

## 4. Supabase setup checklist

Follow [`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project); sign off
in [`LAUNCH_CHECKLIST.md §2`](LAUNCH_CHECKLIST.md#2-supabase-setup--migrations).
Rehearse the identical flow locally first ([`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md))
— same migrations, seed expectations, and admin-promotion SQL, zero blast radius.

- [ ] Project region suits LA/OC users (e.g. `us-west-1`).
- [ ] Auth URL configuration (Dashboard → Authentication → URL Configuration):
      Site URL = production domain; redirect URLs include `/auth/callback`.
- [ ] Email confirmation setting reviewed (Authentication → Providers → Email)
      and the chosen behavior written down for beta support.
- [ ] Daily backups enabled and the restore path located (Database → Backups).

Migrations are verified separately in §5.

## 5. Migration verification

The 14-migration order table lives in
[`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project). Verify in the
Supabase SQL editor:

```sql
select version from supabase_migrations.schema_migrations order by version;
```

Expected: 14 rows, `20260621000000` through `20260715000000`, in order.

If migrations were applied by pasting files into the SQL editor (no CLI), that
table may be empty — fall back to object checks; all three must hold:

```sql
select count(*) from pg_tables where schemaname = 'public';                  -- 8
select count(*) from pg_tables where schemaname = 'public' and rowsecurity;  -- 8
select count(*) from pg_views
  where schemaname = 'public' and viewname = 'public_job_listings';          -- 1
```

Pass: the version list matches exactly, or all three object checks return the
expected counts (8 tables, RLS enabled on all 8, approved-and-unexpired public
view present).

Also probe the explicit API-role grants
(`20260707000000_explicit_table_grants.sql`) — on current Supabase a schema
without them mints sign-in sessions that immediately bounce back to `/login`
(`permission denied for table profiles`, 42501):

```sql
select has_table_privilege('authenticated', 'public.profiles', 'select');  -- t
```

Then run the post-migration smoke in
[`DEPLOYMENT.md §2`](DEPLOYMENT.md#2-supabase-hosted-project) before
continuing with §9–§13.

## 6. Seed / demo-data removal verification

`supabase/seed.sql` is demo data only and must never touch production. The
authoritative seed-pattern queries (three counts that must all be `0`) live in
[`LAUNCH_CHECKLIST.md §3`](LAUNCH_CHECKLIST.md#3-seed--demo-data) — run those
first. Any non-zero count is a **NO-GO**; remediation steps are in that same
section.

**Hard gate: the private beta can proceed only if production contains no
seed/demo users, companies, jobs, applications, messages, or reports.**

Run this supplemental totals query **before** creating the founding admin
(§7), when the database should be completely empty:

```sql
select
  (select count(*) from auth.users)          as users,
  (select count(*) from public.companies)    as companies,
  (select count(*) from public.jobs)         as jobs,
  (select count(*) from public.applications) as applications,
  (select count(*) from public.messages)     as messages,
  (select count(*) from public.reports)      as reports;
```

Pass: all six counts are `0` at this point. Re-run after the smoke tests
(§10–§13): every non-zero count must then be fully attributable to the named
team test accounts from §2 — anything unattributable is a NO-GO.

## 7. First admin promotion

The promotion SQL and its rationale live in
[`DEPLOYMENT.md §5`](DEPLOYMENT.md#5-first-admin-account); sign off in
[`LAUNCH_CHECKLIST.md §4`](LAUNCH_CHECKLIST.md#4-admin-setup). Self-promotion
is blocked by a DB trigger + RLS — the SQL editor is the only supported path.

1. [ ] Sign up the founding admin through the normal production flow.
2. [ ] Copy the user's UUID (Authentication → Users) and run the promotion
       `update` from `DEPLOYMENT.md §5`.
3. [ ] Sign out and back in; `/admin` loads for that account.
4. [ ] A fresh non-admin account gets `/forbidden` on `/admin`.
5. [ ] Verify only the intended admins exist:

   ```sql
   select id, role from public.profiles where role = 'admin';
   ```

Pass: the query returns exactly the 1–2 intended accounts (beta keeps admin to
1–2 people), and steps 3–4 behaved as described.

**Employer role (Slice 21):** unlike the admin role, employers no longer need
SQL. Real users always sign up as `seeker`; a seeker requests employer access
at `/employer/request-access`, and an admin approves or rejects it at
`/admin/employer-requests`. Approval flips `profiles.role` to `employer`
(rejection changes nothing), users cannot self-promote, and approval is not a
business/legal/work-authorization verification. Company creation still happens
after approval through the normal employer flow.

6. [ ] After the founding admin exists: a fresh seeker account can submit an
       employer access request, the admin sees it on `/admin/employer-requests`,
       and approving it lets that account open `/employer` (re-login not
       required — role is read per request).

## 8. Payments (de-scoped in Slice 23)

Payments and paid boosts were de-scoped from the MVP in Slice 23; the
`jobs.boost` column, enum, and write-protection triggers remain in the schema,
intentionally unused. Revisit post-beta.

There is nothing to verify here: no Stripe account, keys, webhook endpoint, or
test/live-mode transition exists in this build. This numbered section is kept
as a stub so the runbook's section numbering (asserted by `npm run verify:beta`)
and cross-references stay stable.

## 9. Public smoke test

Signed out, against the production URL:

- [ ] `/` renders bilingual KR/EN content with the work-authorization
      disclaimer visible.
- [ ] `/jobs` renders (an empty list is fine pre-launch).
- [ ] `/robots.txt` and `/sitemap.xml` respond; the sitemap lists only public
      static pages (no `/admin`, `/employer`, `/dashboard`, no per-job URLs).
- [ ] `/login` and `/signup` are reachable.
- [ ] Security headers set on every response (Slice 26): `curl -I` the
      production URL for `/` and `/api/health` and confirm
      `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`,
      `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, and
      that the CSP `connect-src` names your Supabase origin (code-level headers
      ship in `next.config.ts`; live-domain confirmation is this step).

**Visibility invariant: only `approved` AND unexpired jobs are ever publicly
visible.** `draft`, `pending`, `rejected`, `paused`, and `expired`-status jobs —
and any `approved` job whose `expires_at` has passed — must not appear on
`/jobs`, and their detail URLs must 404 for signed-out visitors, enforced by the
`jobs_select_public_approved` RLS policy and the `public_job_listings` view
(both require `expires_at is null or expires_at > now()`). An expired job stays
in employer/admin history and can still receive **no new applications** — the
seeker insert policy applies the same predicate.

- [ ] After §12 creates a pending job, re-run this section: that job is absent
      from `/jobs` and its direct URL 404s while signed out. An `approved` job
      past its `expires_at` behaves identically (absent from `/jobs`, URL 404s).

The exhaustive click-path list is in
[`LAUNCH_CHECKLIST.md §10`](LAUNCH_CHECKLIST.md#10-qa--verification).

## 10. Role-based smoke test

Accounts: the §7 admin plus fresh employer and seeker accounts from the §2
test inboxes. Verify the access matrix (server-side guards; UI is never the
only protection):

| Actor | `/dashboard` | `/employer` | `/admin` |
|---|---|---|---|
| Signed out | redirect to `/login?next=…` | redirect to `/login?next=…` | redirect to `/login?next=…` |
| Seeker | ok | `/forbidden` | `/forbidden` |
| Employer | ok | ok | `/forbidden` |
| Admin | ok | ok | ok |

Admins entering employer areas (and any signed-in role entering the generic
dashboard) is by design — the hierarchy in `src/lib/auth/access.ts`.

Execution order for §11–§13: run §12 (employer) first to create a pending
job, then §11 (admin) to moderate it, then §13 (seeker) to apply and report,
then finish §11's report-queue step.

## 11. Admin smoke test

Run after §12 has created a pending job.

- [ ] Sign in as the §7 admin; `/admin` loads.
- [ ] The dashboard shows the four live queue cards — pending jobs,
      unverified companies, open reports, employer access requests — with
      counts matching the test data, plus admin navigation to every tool and
      an operational-health card linking `/api/health`.
- [ ] The pending job from §12 appears in the moderation queue with its
      compliance review flags.
- [ ] Approve it → the job appears on public `/jobs`.
- [ ] Reject a second test posting → it never becomes publicly visible.
- [ ] After §13's report step: the report appears in the admin report queue;
      review and dismiss both work.
- [ ] `/admin/analytics` renders KPI counts consistent with the test data
      created so far.

> Rehearsing with placeholder Supabase values shows the "Admin setup
> required" panel instead of live counts — dev-auth admin previews the UI
> only. Wire a real Supabase per [`LOCAL_SUPABASE.md`](LOCAL_SUPABASE.md)
> for live queue data.

## 12. Employer smoke test

- [ ] Sign up the employer test account → complete company setup.
- [ ] Post a job: the compliance acknowledgement is required, and clearly
      risky phrasing is blocked with an explanation.
- [ ] The new job is `pending`: not listed on `/jobs`, and its direct URL 404s
      while signed out (§9's invariant, proven with a live example).
- [ ] After §11 approves it: publicly visible on `/jobs`.
- [ ] After §13 applies: the application is visible on the employer side, and
      replying in the messaging thread works.

## 13. Seeker smoke test

- [ ] Sign up the seeker test account → browse `/jobs`; keyword, city, and pay
      filters work and reset cleanly.
- [ ] Signed out, open a job → Apply → redirected to `/login?next=…` → after
      signing in you land back on the apply flow.
- [ ] Submit an application; re-submitting shows the duplicate state.
- [ ] The messaging thread with the employer works in both directions.
- [ ] Status changes made by the employer (reviewing/interview/offered) show
      on the seeker dashboard.
- [ ] Report a job (this feeds §11's report-queue step).

## 14. Mobile/desktop QA checklist

The authoritative manual script (full click-path) is in
[`LAUNCH_CHECKLIST.md §10`](LAUNCH_CHECKLIST.md#10-qa--verification) — run it
at **390px and 1440px** in Chrome + Safari. Beta device matrix:

| Width | Browsers | Notes |
|---|---|---|
| 390px | iOS Safari, Android Chrome | DevTools emulation is acceptable for beta |
| 1440px | Chrome, Safari | |

Visual gates on top of the script:

- [ ] No horizontal scroll at 390px on `/`, `/jobs`, job detail, and forms.
- [ ] Keyboard-only: forms usable end to end; `:focus-visible` rings show.
- [ ] Korean text renders correctly alongside English at both widths.
- [ ] Tap targets on the `/jobs` filters are usable at 390px.
- [ ] VoiceOver spot-check: labels announce correctly on the application form.

## 15. Known beta limitations

Accepted for the private beta — details in the
[`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) "Deferred" section and
[`DEPLOYMENT.md §6`](DEPLOYMENT.md#6-known-issues):

- Legal/policy copy is placeholder pending attorney review; beta invites must
  say the service is a beta with policies being finalized. Neither the app
  nor this runbook is a substitute for attorney review, and none of it is
  legal, tax, immigration, or employment advice.
- Email delivery is a dev stub (`EMAIL_PROVIDER=dev`) — no real email/SMS is
  sent.
- No error-tracking or analytics provider — the beta runs on Vercel and
  Supabase platform logs, plus the public `GET /api/health` config/liveness
  endpoint. Log triage and the incident process live in
  [`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md).
- **Browser E2E (Slice 30) covers the credential-free Chromium/dev-auth surface
  only**: public shell + hydration, job-discovery filters, dev-auth role guards,
  responsive nav, and `/api/health`, all against mock data with placeholder
  Supabase — no real database writes. Real-Supabase flows, OAuth/SMS provider
  callbacks, Safari, responsive *visual* review, and keyboard/VoiceOver remain
  manual; §§9–14 are that manual compensation.
- Admin promotion is manual SQL (§7); there is deliberately no self-serve
  path to the admin role. The employer role is granted through the Slice 21
  request flow (`/employer/request-access` → admin review at
  `/admin/employer-requests`) — a self-serve *request*, never a self-serve
  *promotion*.
- No per-job sitemap URLs and no Open Graph preview image.

## 16. Go / no-go decision table

Fill in after working through every section. **Go** requires every hard
blocker to pass. Record the final sign-off (name + date) in
[`LAUNCH_CHECKLIST.md §11`](LAUNCH_CHECKLIST.md#11-go--no-go) — that table is
the sign-off of record; this one is the execution summary feeding it.

| Check | Runbook section | Result | Blocker? |
|---|---|---|---|
| CI green + `npm run verify:beta` pass on the release commit | §2 | ☐ | Hard |
| Required env vars set and valid, no placeholder fragments | §3 | ☐ | Hard |
| Supabase configured (auth URLs, backups) | §4 | ☐ | Hard |
| All 14 migrations verified (incl. explicit API-role grants) | §5 | ☐ | Hard |
| Zero seed/demo data (users, companies, jobs, applications, messages, reports) | §6 | ☐ | Hard |
| Founding admin verified; no unintended admins | §7 | ☐ | Hard |
| Public visibility invariant (approved-only) proven | §9 | ☐ | Hard |
| Role guards hold for all roles | §10–§13 | ☐ | Hard |
| Mobile/desktop QA passed | §14 | ☐ | Hard |
| Attorney review of legal copy | §15 | ☐ | Conditional — accepted-pending for private beta; hard blocker for public launch |

Any unchecked **Hard** row = **no-go**. Conditional rows must either pass or
be explicitly accepted (name + date) with their scope limitation enforced.

## 17. Social & phone auth verification

Run per enabled method, after its Supabase dashboard setup
([`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md)) and flag flip. Methods left with
their default-`false` flags need no verification — they render as
"setup required" and this section is N/A for them. Not a launch blocker:
Conditional in the §16 sense — an unverified method's flag simply stays
`false`.

**Precondition: §5 passed on this same project** — the schema is deployed
including the `20260707…` explicit table grants. E2E needs provider
credentials, the `/auth/callback` redirect allowlist, the app flag, **and**
the deployed schema (profiles trigger + grants) on the **same** Supabase
project. A project missing the schema side fails in a characteristic way:
consent/OTP succeeds and a session is minted, but the app bounces back to
`/login` — check for `permission denied for table profiles` (42501) before
suspecting the provider setup.

1. **UI state sanity**: `/login` and `/signup` show enabled buttons only for
   flipped flags; every other method shows the calm setup-required state.
2. **Social smoke (per enabled provider)**: full sign-in round-trip — button →
   provider consent → back to the app signed in. Confirm the URL passes
   through `/auth/callback` and lands on `/dashboard` (or the `next` target).
3. **Phone OTP smoke**: send a code to a real number (E.164, e.g. `+1…`),
   verify the 6-digit code, confirm the session works. Check the resend
   button is locked for ~60 seconds after sending. Confirm no phone number or
   code appears in any application log.
4. **Profile provisioning**: after the first sign-up via each new method, the
   `profiles` row exists with role `seeker` (phone-only accounts have a null
   email — expected). Role changes still happen only via admin (§7).
5. **Open-redirect spot checks**: `/auth/callback?next=//evil.example` and
   `/auth/callback?next=/\evil.example` (with a valid session code flow) must
   land on `/dashboard`, never off-site. `?next=/jobs` must land on `/jobs`.
6. **Copy check**: nothing in the sign-in UI claims identity, work
   authorization, age, or background verification — phone verification only
   means control of that number.
