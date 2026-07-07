# Local Supabase — K-Work US

How to run K-Work US on your machine with a **real local Supabase stack**
(Auth + Postgres in Docker) instead of the placeholder "dev auth mode".
Everything in this guide is local-only and zero-cost: no hosted project, no
real credentials, no external services touched.

Related docs: [`../supabase/README.md`](../supabase/README.md) (schema,
migrations & seed details), [`DATABASE.md`](DATABASE.md) (schema reference),
[`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md) (social/phone sign-in setup),
[`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md) (`/api/health` reference),
[`BETA_READINESS.md`](BETA_READINESS.md) (hosted launch runbook — rehearse
this guide first).

## 1. Purpose

The app runs in one of two modes, decided by the Supabase values in
`.env.local` (see `isSupabaseConfigured()` in `src/lib/supabase/config.ts`):

| `.env.local` Supabase values | Auth | Job reads | Writes (company/job/apply) |
| --- | --- | --- | --- |
| Placeholders (fresh `cp .env.example`) | Dev role-picker (mock cookie) | Deterministic mock data | Unavailable states |
| Real **local** Supabase values (this guide) | Real Supabase Auth | Local Postgres (seeded) | Real DB writes (once signed in) |

Local Supabase gives you real `auth.users` rows, real RLS enforcement, and the
real migrations + seed — the closest possible rehearsal of the hosted setup
([`BETA_READINESS.md`](BETA_READINESS.md)) without touching anything hosted.

## 2. Prerequisites

- **Node.js 20+** and **npm 10+** (`node --version`, `npm --version`)
- **Docker Desktop**, running — the local stack lives in containers
- **Supabase CLI**:

  ```bash
  brew install supabase/tap/supabase
  supabase --version   # any recent version is fine
  ```

  Non-Homebrew installs: <https://supabase.com/docs/guides/cli>.

## 3. Fresh setup from clone

From the repo root:

```bash
npm install
cp .env.example .env.local
```

At this point `npm run dev` already works in **dev auth mode** (mock role
picker, mock job data). The rest of this guide upgrades that to a real local
Auth + Postgres stack.

## 4. Starting local Supabase

From the repo root (the CLI reads `supabase/config.toml`):

```bash
supabase start
```

The first run downloads Docker images and can take a few minutes. When it
finishes, it prints your local stack's endpoints and keys:

- **API URL** — `http://127.0.0.1:54321` (this is the "Supabase URL")
- **DB** — Postgres on port `54322` (pinned in `supabase/config.toml`)
- **Studio URL** — `http://127.0.0.1:54323` (local dashboard + SQL editor)
- **anon key** and **service_role key** — generated for your local stack

Reprint them any time with:

```bash
supabase status
```

`supabase/config.toml` is deliberately minimal (project id, DB port/version,
seed wiring); auth uses the Supabase CLI defaults, which already point at
`http://localhost:3000`. No config changes are needed for this guide.

> The printed keys only work against your local stack, but they are still
> secret-shaped values. Treat them like real secrets anyway: they go in
> `.env.local` and nowhere else (§16).

## 5. Applying migrations + seed

```bash
supabase db reset
```

This rebuilds the local database from scratch: every file in
`supabase/migrations/` in filename order, then `supabase/seed.sql` (wired via
`[db.seed]` in `supabase/config.toml`). Re-run it whenever you want a clean
slate — it destroys **local** data only.

What the seed gives you (details in [`../supabase/README.md`](../supabase/README.md)):

- 3 fictional employer accounts + 3 fictional LA/OC companies
- **8 approved jobs** (publicly visible), **1 pending**, **1 draft**

The seed employer accounts (`employer1@example.com` etc.) exist so ownership
and RLS behave realistically. They are **database fixtures, not login
accounts** — the app has no email/password sign-in UI, so you will not log in
as them (see §9 and Appendix A for how sign-in works locally).

## 6. Copying local values into `.env.local`

Map the `supabase status` output onto the three Supabase variables in
`.env.local`:

| `supabase status` output | `.env.local` variable |
| --- | --- |
| API URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key | `SUPABASE_SERVICE_ROLE_KEY` |

```bash
# .env.local (never committed)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
```

Rules:

- These values belong **only** in `.env.local`. It is gitignored (`.env*`
  with a tracked `!.env.example` exception) and must stay that way — never
  paste keys into tracked files, docs, or commit messages. `npm test`,
  `npm run verify:beta`, and `npm run verify:local-supabase` all scan for
  JWT-shaped strings.
- Replace the **whole** placeholder value. The app treats any value containing
  `your-project`, `your-anon-key`, `your-service-role-key`, or `example.com`
  as "not configured" and stays in dev auth mode.
- Set **all three**. The app's auth works with URL + anon key alone, but
  `/api/health` then reports Supabase as `"partial"` (the service_role key is
  used by the Stripe webhook path; see §8).

## 7. Running the app

```bash
npm run dev
```

Open <http://localhost:3000>. `NEXT_PUBLIC_*` values are read when the dev
server starts — **restart `npm run dev` after any `.env.local` change**, or
the app will keep running in the previous mode.

## 8. Verifying `/api/health`

Open <http://localhost:3000/api/health>. It returns coarse statuses only
(never env values — reference: [`OPERATIONAL_HEALTH.md`](OPERATIONAL_HEALTH.md)).
With §6 completed you should see:

```json
{ "checks": { "supabase": "configured" } }
```

(other checks elided). Readings:

- `"configured"` — URL, anon key, and service_role key are all real. Done.
- `"partial"` — one of them is missing or still a placeholder (most often the
  service_role key). Fix `.env.local`, restart the dev server.
- `"missing"` — you are still fully on placeholders (dev auth mode).

## 9. Verifying `/login` and `/signup`

Open <http://localhost:3000/login> and <http://localhost:3000/signup>. With
Supabase configured, expect:

- The **dev role-picker is gone.** It renders only when Supabase is *not*
  configured outside production — its absence is your visual confirmation that
  real auth mode is active.
- Kakao / Google / Naver buttons and the phone section all show a calm
  **"setup required"** state, because the `NEXT_PUBLIC_AUTH_*` flags default
  to `false`. This is by design, not a bug
  ([`AUTH_PROVIDERS.md §2`](AUTH_PROVIDERS.md#2-enablement-model)). Keep the
  flags `false` for the basic smoke.
- No crash, no raw error text, both pages fully rendered.

Consequence: the **basic smoke has no clickable sign-in path**. That is the
expected zero-config state. To rehearse a real session and the write flows,
use **Appendix A** (local phone test OTP — no real credentials), or configure
a real provider per [`AUTH_PROVIDERS.md §5`](AUTH_PROVIDERS.md#5-per-provider-supabase-setup).

## 10. Verifying real DB reads on `/jobs`

Open <http://localhost:3000/jobs>: the **8 approved seed jobs** should be
listed. The pending and draft seed jobs must never appear — public pages read
the approved-only view.

The seed intentionally mirrors the dev mock data, so prove the reads come from
Postgres: open Studio (<http://127.0.0.1:54323>) → SQL editor →

```sql
update public.jobs
set title = title || ' (LOCAL DB)'
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
```

Refresh `/jobs`. If the first job's title now carries the suffix, you are
reading the local database, not mocks. Undo with `supabase db reset`.

## 11. Verifying employer company/job creation

**Signed out (basic smoke):** open
<http://localhost:3000/employer/company> and
<http://localhost:3000/employer/jobs/new>. Both must redirect to
`/login?next=…` — that redirect *is* the real fail-closed guard behavior,
now backed by a real (absent) Supabase session instead of the dev cookie.

**With a session (Appendix A):** new sign-ins get a `profiles` row with role
`seeker`. Since Slice 21 the product path to the employer role is the request
flow — the seeker submits `/employer/request-access` and an admin (§12)
approves it at `/admin/employer-requests`, which is also the better rehearsal
once you have an admin account. For a quick local shortcut you can still
promote your test user in Studio → SQL editor:

```sql
-- find your user id first:
select id, phone, email from auth.users order by created_at desc;

update public.profiles set role = 'employer' where id = '<auth user uuid>';
```

Then walk the write path: `/employer/company` (create the company) →
`/employer/jobs/new` (post a job; the compliance acknowledgement and pay
fields are required) → the job saves as **pending** → confirm it does **not**
appear on `/jobs` until an admin approves it (§12).

## 12. Verifying admin promotion locally

Same mechanism as the production runbook: **manual SQL only.** Self-promotion
through the app is blocked by RLS and a trigger, by design. In Studio → SQL
editor:

```sql
update public.profiles set role = 'admin' where id = '<auth user uuid>';
```

Sign out and back in (or reload), open <http://localhost:3000/admin>, and
approve the pending job from §11 — it should then appear on `/jobs`. Signed
out, `/admin` must redirect to `/login` like the employer pages.

## 13. Common errors and fixes

| Symptom | Cause → fix |
| --- | --- |
| `supabase start` fails or hangs immediately | Docker Desktop is not running → start Docker, retry. |
| `port is already allocated` (54321–54323) | Another Supabase project is running → `supabase stop` in that project's directory, or find it with `docker ps`. |
| Dev role-picker still visible after §6 | A placeholder fragment is still in one of the three values, or the dev server was not restarted (§7). |
| `/api/health` shows `"supabase": "partial"` | Usually the `SUPABASE_SERVICE_ROLE_KEY` is missing or placeholder → copy it from `supabase status`, restart. |
| `/jobs` is empty | Seed did not run → `supabase db reset`; check `[db.seed]` in `supabase/config.toml` is intact. |
| `supabase db reset` errors after a CLI upgrade | Container/image mismatch → `supabase stop --no-backup`, then `supabase start` fresh. |
| Every sign-in method says "setup required" | Expected while `NEXT_PUBLIC_AUTH_*` flags are `false` (§9). Use Appendix A for a local sign-in path. |
| Sign-in works but the user has the wrong role | Roles come from `public.profiles.role`, not the auth metadata → update it via SQL (§11/§12). |

## 14. Resetting the local DB safely

- `supabase db reset` — wipe the local DB, re-apply migrations + seed. The
  standard "make it clean again" command.
- `supabase stop` — stop the containers but **keep** the data volumes; the
  next `supabase start` resumes where you left off.
- `supabase stop --no-backup` — stop and delete the volumes (full clean).

All three touch only the local Docker stack. This guide never runs
`supabase link`, so the CLI has no hosted project to talk to — the reset
commands physically cannot affect hosted data.

## 15. Local Supabase vs hosted Supabase

| | Local stack (this guide) | Hosted project (beta/production) |
| --- | --- | --- |
| Keys | Printed by `supabase start`; only valid locally; rotate by recreating the stack | Real secrets from the dashboard; live only in Vercel env / `.env.local` |
| Configuration | `supabase/config.toml` (tracked, no secrets) | Dashboard (Auth URL config, providers, backups) per [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Migrations | `supabase db reset` applies everything + seed | `supabase db push` applies migrations; **never** apply the seed ([`LAUNCH_CHECKLIST.md §3`](LAUNCH_CHECKLIST.md#3-seed--demo-data)) |
| Auth providers | Off; sign-in via Appendix A test OTP if needed | Configured per [`AUTH_PROVIDERS.md`](AUTH_PROVIDERS.md) with real credentials |
| Blast radius | Disposable — `supabase db reset` any time | Real users and data — follow [`BETA_READINESS.md`](BETA_READINESS.md) |

Rehearse everything here **before** the hosted setup: it is the same
migrations, seed expectations, guard behavior, and admin-promotion SQL you
will later run against the real project.

## 16. What not to commit

- **`.env.local`** — or any `.env*` file except the tracked `.env.example`
  template. Enforced by `.gitignore` and by `npm test`
  (`tests/security.test.ts`).
- **Any key printed by `supabase start`/`supabase status`** — anon or
  service_role, local or not. Never in code, docs, or examples; the secret
  scanners (`npm test`, `npm run verify:beta`, `npm run verify:local-supabase`)
  reject JWT-shaped strings in tracked files.
- **A hosted project ref** (the long `<ref>.supabase.co` hostname) — this
  repo's docs and `.env.example` must contain placeholders only.
- **Appendix A's `test_otp` edit to `supabase/config.toml`** — it is a
  local-only convenience; revert it before committing
  (`git checkout -- supabase/config.toml`). `npm run verify:local-supabase`
  fails if a `test_otp` block is committed.
- `supabase/.branches` and `supabase/.temp` (CLI state) — already gitignored.

## 17. Manual local smoke checklist

The end-to-end rehearsal path. Steps 1–4 are the setup from §§4–7:

1. `supabase start`
2. `supabase db reset`
3. Put the local URL + anon key + service_role key in `.env.local` (§6)
4. `npm run dev`
5. Open and verify:

- [ ] <http://localhost:3000/api/health> → `"supabase": "configured"` (§8)
- [ ] <http://localhost:3000/jobs> → 8 approved seed jobs; the pending/draft
      seed jobs are absent (§10)
- [ ] <http://localhost:3000/login> and <http://localhost:3000/signup> →
      render without crashing; dev role-picker is **gone**; methods show
      "setup required" while provider flags are `false` (§9)
- [ ] <http://localhost:3000/employer/company> and
      <http://localhost:3000/employer/jobs/new> → signed out, both redirect
      to `/login?next=…` (§11)
- [ ] <http://localhost:3000/admin> → signed out, redirects to `/login` (§12)

With a real session (Appendix A):

- [ ] Sign in via phone test OTP; promote the user to `employer` via SQL (§11)
- [ ] Create a company and post a job → job is **pending**, not on `/jobs`
- [ ] Promote a user to admin via SQL (`role = 'admin'`, §12) → approve the
      job in `/admin` → it appears on `/jobs`

## Appendix A — optional: real sign-in via local phone test OTP

The basic smoke needs no sign-in. To rehearse a **real session** (and the §11
/ §12 write flows) without any real OAuth or SMS credentials, use the Supabase
CLI's test-OTP support: a fixed phone → code mapping that the local stack
accepts without sending SMS.

1. **Local-only** edit to `supabase/config.toml` (do **not** commit this —
   §16):

   ```toml
   [auth.sms]
   enable_signup = true

   [auth.sms.test_otp]
   # digits exactly as the login form will submit them, without the "+"
   15005550006 = "123456"
   ```

   `15005550006` is a well-known fake US test number — use any number you
   like, as long as it is not a real person's.

2. Enable the phone method for the app, in `.env.local`:

   ```bash
   NEXT_PUBLIC_AUTH_PHONE_ENABLED=true
   ```

3. Restart both layers (config changes need a stack restart):

   ```bash
   supabase stop && supabase start
   npm run dev
   ```

4. On `/login`, the phone form is now active: enter `+1 500 555 0006`,
   request the code, enter `123456`. You are signed in with a real local
   session; the `on_auth_user_created` trigger creates your `profiles` row
   with role `seeker`.

5. Continue with §11 (promote to employer, create company + job) and §12
   (promote to admin, approve the job).

6. When done: revert `supabase/config.toml`
   (`git checkout -- supabase/config.toml`) and set
   `NEXT_PUBLIC_AUTH_PHONE_ENABLED` back to `false` if you want the
   zero-config state back.

> Never configure test OTP codes on a **hosted** project — it would let
> anyone sign in with the published code. It is safe only on a throwaway
> local stack. If your CLI version rejects the snippet keys, check
> `supabase start` output and the CLI auth config reference for your version.
