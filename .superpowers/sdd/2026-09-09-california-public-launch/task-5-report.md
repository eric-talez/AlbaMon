# Task 5 / B1 implementation report

Status: DONE for the authorized local software and test scope. Branch `codex/california-public-launch`, worktree `/Users/rinny/IdeaProjects/AlbaMon/.worktrees/california-public-launch`, base `5dbde47f35bf1bf45ab75ca5e06be5229c8b791d`. No subagents or reviewers were dispatched. K-Work US remains the product brand.

## Implemented behavior

- Public search now returns `{ jobs, page, hasNext }`, accepts `payUnit` and bounded page input, fetches 21 rows for a 20-row page, and uses complete `posted_at` timestamps plus descending job IDs for stable ties. Invalid pages use page 1; public keyword and city input are limited to 200 and 100 characters.
- Pay filters compare `pay_min` to the requested minimum within one `pay_unit`. A minimum or pay sort without an explicit unit means hourly. An unrelated search does not implicitly hide annual listings. Mock and database paths use the same filter, sort, and pagination behavior.
- Replaced raw PostgREST `or(...ilike...)` keyword construction with one parameterized SQL RPC over `public_job_listings`. `strpos(lower(concat_ws(...)), lower(search_query))` keeps `*`, comma, parentheses, `%`, and `_` literal and removes all post-page client filtering. No dependency or external search service was added.
- Added data-derived California city options via a SECURITY DEFINER RPC that reads only the safe public view. The no-data state still provides “CA 전체” and keyword search. The filter remains a native GET form; pagination links preserve validated filters, while submitting changed filters omits `page` and returns to page 1.
- Employer job parsing and the database write boundary require `state = 'CA'` and `pay_min > 0`, with the specified messages. The publication boundary revalidates both fields on any update whose resulting status is approved, so changing only moderation status cannot publish invalid legacy data. Legacy invalid rows can still be paused or closed without invented city/pay changes.
- Anonymous base-table reads and the safe public view now expose approved California rows only. Separate owner and active AAL2 admin policies still expose their authorized private or legacy rows. B2 can replace this temporary public predicate with its unified open-job predicate.
- Normalized the known local Koreatown fixture to city `Los Angeles` while retaining `Koreatown, Los Angeles, CA` in `address_display`. Added San Jose, Sacramento, and San Diego fixtures for literal keyword, hourly minimum, annual pay, timestamp, and city coverage. New employer city input collapses repeated whitespace; state is a submitted read-only CA field and positive numeric pay fields have a `0.01` minimum.
- Changed public metadata, launch market, dashboard discovery copy, and empty-application copy from LA/OC to California. The K-Work US name and all existing production no-mock/readiness and authentication behavior remain intact.
- Added only `supabase/migrations/20260909000200_ca_job_search.sql`; historical migrations were not edited.

## TDD and debugging evidence

All Node/npm commands used `env PATH="/Users/rinny/.nvm/versions/node/v22.23.1/bin:$PATH"`.

### Search and validation RED / GREEN

The initial focused RED was:

```text
npm test -- tests/job-search.test.ts tests/employer-validation.test.ts
Test Files 2 failed
Tests 7 failed | 51 passed
```

It demonstrated missing pay-unit/page parsing, cross-unit `pay_max` comparison, static cities, and absent California/positive-pay job validation. After changing the result contract and adding RPC expectations, the search-only RED was 15 failed / 13 passed. The implemented parser, mock query, city RPC, and result mapping made the focused search suite pass 28/28 at that stage.

A separate valid UI RED rendered `JobFilters` with `createElement` and failed 3 of 15 assertions for the old region/result/pay controls. A follow-up RED caught an early over-filtering defect: the pay-unit select defaulted to hourly even when no pay constraint was active, which hid annual listings. The blank default plus parser-side hourly inference made both focused cases pass. Literal punctuation fixture coverage also failed once before the mock fixture gained all six characters.

The final dashboard-wide California copy test failed 1/11 on the two remaining LA/OC strings, then passed 11/11 after those strings were updated.

### Database RED / GREEN

Before migration 00200:

```text
npm run test:db
new ca_job_search.test.sql: 17/17 assertions failed
existing database assertions: 148 passed
```

Applied only the additive migration to isolated `albalmon-ca-launch` with `supabase migration up --local`. Two literal-query assertions initially found an existing generic parenthesis fixture; narrowed them to literal `open(`/`close)` terms, which test the grammar defect without false matches. Expanded the matrix for anonymous base-table CA filtering, owner/admin legacy visibility, approval-only validation, and safe pause behavior. Final result is 168/168.

### Browser RED / GREEN

The first real browser pagination run had 2 passes / 1 failure because the test incorrectly assumed URL parameter order. The product preserved the correct values. The test now parses `URLSearchParams` and runs its disposable fixture group serially. Final targeted verification passes actual local REST/RPC city and punctuation queries, JavaScript-disabled GET filtering and page reset, hourly minimum semantics and label, plus 20/1 stable paging.

The browser test refuses any URL other than isolated API port 55321. It obtains the local service key in process memory only for fixture setup/cleanup, never logs it, and removes its 21 rows in `afterAll`.

## Final verification

| Command/check | Actual result |
| --- | --- |
| Required focused unit command | exit 0; 3 files, 75 tests passed |
| `npm test` | exit 0; 50 files, 573 tests passed in 4.77s |
| `npm run test:db` | exit 0; 3 files, 168 tests, PASS |
| `npm run typecheck` | exit 0; no errors |
| `npm run lint` | exit 0; no warnings/errors |
| `npm run build` with isolated public URL/anon key | exit 0; Next 16.3.4 compiled, TypeScript passed, 17 static pages |
| Targeted `npm run test:e2e -- tests/e2e/ca-search.spec.ts` | exit 0; 3 tests passed in 9.5s |
| Full `npm run test:e2e` | exit 0; 12 tests passed in 21.5s, including all 4 existing auth/security tests |
| Isolated auth rerun | exit 0; 4 tests passed in 9.1s |
| `git diff --check` | exit 0 |
| Source copy inspection | no `LA/OC`, `LA·OC`, or `Orange County` match under `src` |
| Post-test local preflight | non-CA 0; nonpositive-pay 0; approved-incompatible 0; parenthesized-city 0; leftover E2E rows 0; approved CA 11 |

The full 12-test browser run emitted one Next server `destination stream closed early` message after all tests passed and the owned server was shutting down. The targeted CA run was clean, and an isolated rerun of all four auth/security browser flows was also clean. No browser assertion, fixture cleanup, or process exit failed.

Build and browser environment values came from `supabase status -o json` inside a Node 22 process and were passed directly to the child process. The public URL and anonymous key were not printed; the service-role value was deleted from the app server environment. The isolated stack remains running. Neither `k-work-us543xx` nor native PostgreSQL 5432 was touched or reset.

## Local and hosted data preflight

The local count-only query found zero incompatible rows and zero city values containing parentheses after normalizing the known fixture. This is evidence only for the disposable local stack.

Hosted data remains **UNVERIFIED**. Before applying the migration in any hosted project, an operator must run read-only inventory queries equivalent to:

```sql
select state, pay_unit, count(*) from public.jobs group by state, pay_unit order by state, pay_unit;
select count(*) filter (where state <> 'CA') as non_ca,
       count(*) filter (where pay_min <= 0) as nonpositive_pay,
       count(*) filter (where moderation_status = 'approved' and (state <> 'CA' or pay_min <= 0)) as approved_incompatible
from public.jobs;
select id, company_id, moderation_status, city, state, pay_min, pay_unit
from public.jobs
where state <> 'CA' or pay_min <= 0
order by moderation_status, id;
select city, count(*) from public.jobs group by city order by city;
```

For hosted incompatible rows, first pause any currently public record, then confirm its actual workplace and base pay from the owner/source record. Correct only verified values through the normal review path. Do not delete rows, invent minimum pay, or bulk-transform unknown cities. A verified `Los Angeles (Koreatown)` record should store city `Los Angeles` and retain the neighborhood in `address_display`, matching the representative-approved local normalization.

## Files and self-review

New files: migration 00200, `ca_job_search.test.sql`, and `tests/e2e/ca-search.spec.ts`. Modified the public jobs query/page/filter types and UI, employer job validation/form, California site and dashboard copy, known mock/seed fixtures, existing DB count assertions, and focused unit/smoke/public browser tests. The homepage and footer already consume `LAUNCH_MARKET`, so changing that shared value updated their rendered copy without artificial component edits.

Self-review checked every selected TypeScript/SQL/test diff, installed Next 16.3.4 App Router form/search-param behavior, literal query parity, stable 21-row ordering, pay-unit inference, result callers, RPC ACLs and safe-view source, base jobs RLS, publication-only legacy behavior, production fallback safety, auth test preservation, local fixture cleanup, and absence of historical migration changes. No correctness blocker remains. Pagination is deliberately capped at page 500; when public inventory exceeds 10,000 rows, replace offset paging with a cursor as specified.

Applied the implementer template, TDD, writing-good-tests, systematic debugging, ponytail, and verification-before-completion guidance.

## Commit

Selected-file commit message: `feat: support California search with consistent pay and pagination`. The immutable hash is reported to the controller after creation.
