# Public job flow recovery — 2026-09-12

Scope: anonymous job discovery, public detail, and the signed-out apply entry.
Google, Kakao and phone authentication were not configured or tested.

## Data and source

The private application URL pointed at the old Studio endpoint, 54323. The old
543xx database has 14 migrations and ten undated-expiry jobs. Neither that
database nor the retained 553xx database was reset, seeded or upgraded.

An independent local project, `albamon-job-flow`, was initialized from the
current migrations and fictional seed. Its API is 56321, Postgres 56322 and
Studio 56323. Its private CLI workspace is
`~/.codex/local-stacks/albamon-job-flow`; optional analytics is disabled there.
The private API URL and keys were paired from this project's CLI status without
printing or committing keys. Existing auth-provider flags were preserved.

Read-only verification commands:

```bash
docker exec supabase_db_albamon-job-flow psql -U postgres -d postgres -X -At \
  -c 'select count(*) from supabase_migrations.schema_migrations; select count(*) from public.jobs; select count(*) from public.public_job_listings;'
# 26, 13, 11
docker exec supabase_db_k-work-us psql -U postgres -d postgres -X -At \
  -c 'select count(*) from supabase_migrations.schema_migrations; select count(*) from public.jobs;'
# 14, 10 (unchanged)
```

Anonymous REST `GET /rest/v1/public_job_listings?select=id,title,expires_at,updated_at`
on 56321 returned 11 rows, all with expiry values. The paired anon key was read
in memory from captured CLI status. These rows are fictional local fixtures,
not customer postings.

## Browser verification

Playwright Chromium used the configured app at `http://localhost:3000`:

| Action | Observed result |
| --- | --- |
| `GET /api/ready` | 200, `{"status":"ok"}` |
| Open `/jobs` and click a card | 11 DB cards; detail heading matches the clicked title |
| Open all 11 listed canonical seed UUIDs | All HTTP 200, all detail headings match |
| Choose Irvine through the filter form | One result, matching the DB city count |
| Search `no-job-flow-match-xyz` | Honest empty-search message |
| Open a missing canonical UUID | HTTP 404 |
| Click Apply while signed out | Redirect through `/login` |
| Repeat card click at 390px viewport | Visible matching detail heading |
| Stop only this stack's API gateway | Jobs outage heading, no `kw-*` cards; readiness 503 |
| Open an existing detail during gateway outage | Jobs retry boundary, not missing-job copy |
| Restart gateway, wait for readiness 200, click Retry | New GET `/jobs`; all 11 DB cards restored |

Fault injection used `docker stop supabase_kong_albamon-job-flow` and a
`finally` cleanup with `docker start supabase_kong_albamon-job-flow`. No other
stack was stopped. Recovery waits for `/api/ready` to return 200 before clicking
Retry; `docker start` alone does not prove the gateway is ready. An earlier
PostgREST-only stop left the gateway waiting upstream and exceeded the browser's
30-second navigation timeout; this change does not add a request deadline.

## Automated checks

- Node 22.23.1, locked `npm ci`.
- Unit baseline: 938 passed, six optional integration checks skipped.
- Regression tests first failed on configured-development mock fallback and
  canonical seed IDs; focused tests passed after the shared-helper fixes.
- Full changed suite: 943 passed, six optional integration checks skipped.
- `npx next typegen`, `npm run typecheck`, `npm run lint`: passed.
- `npm run build`: passed with the configured local API.
- Final consolidated development browser suite: 31 passed.
- Production `next start` on port 3101: readiness 200, 11 DB cards, matching
  clicked detail heading; mock, malformed and missing canonical IDs all 404.
