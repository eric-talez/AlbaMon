# Public Job Flow Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Restore consistent public job list-to-detail navigation and truthful database failure handling.

**Architecture:** Keep the existing shared public job read layer and Supabase view/RPC contracts. Remove configured-error mock fallback, accept canonical PostgreSQL UUIDs, and add a job-specific Next error boundary. Use a separate local stack for the complete current schema and local fixtures while retaining old data untouched.

**Tech Stack:** Node 22, Next.js 16.3.4, React 19, Supabase, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-job-flow-recovery.md`

## Global Constraints

- Google, Kakao and phone authentication are explicitly deferred.
- Configured Supabase is the sole source for public lists, search, city options and detail.
- Production never serves fictional fixtures. Deliberately unconfigured development retains functional fixtures.
- Preserve approved, California, unexpired and active-owner visibility; never turn missing data into an outage or an outage into missing data.
- Use installed Next.js docs and current dependencies. No new dependencies.
- Preserve retained databases and secrets. Local runtime verification uses a separately named stack with the current schema and fictional seed.

### Task 1: Restore consistent public reads and navigation

**Files:**
- Modify `src/lib/db/jobs.ts`: shared read and ID validation behavior.
- Create `src/app/(public)/jobs/error.tsx`: retryable listing/detail outage message.
- Modify `tests/job-search.test.ts` and `tests/db-jobs.test.ts`: shared read regressions.
- Modify `tests/e2e/job-discovery.spec.ts`: demo list-to-detail navigation regression.
- Create `tests/job-error.test.tsx` if needed to verify error rendering/retry using existing test utilities.
- Modify `docs/LOCAL_SUPABASE.md`: explain source selection, API versus Studio and preserved-stack recovery, after controller supplies verified runtime facts.

**Interfaces:**
- Keep `getApprovedJobs(): Promise<Job[]>`, `getApprovedJobById(id: string): Promise<Job | undefined>`, `getPublicJobCities(): Promise<string[]>` and `searchApprovedJobs(params: JobSearchParams): Promise<JobSearchResult>` unchanged.
- Missing rows and malformed IDs return undefined; configured query/connection failures reject in development and production.
- The Next error component consumes `retry: () => void`, per installed Next 16.3.4 docs.

- [ ] Read all four helpers and their public consumers, existing tests and installed `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
- [ ] Extend the existing configured-failure test to both development and production and all four helpers; add query-result-error coverage alongside rejected-client coverage. Representative expectation:

```ts
await expect(getApprovedJobs()).rejects.toBe(failure);
await expect(searchApprovedJobs({})).rejects.toBe(failure);
await expect(getPublicJobCities()).rejects.toBe(failure);
await expect(getApprovedJobById("bbbbbbbb-0000-0000-0000-000000000001")).rejects.toBe(failure);
```

- [ ] Add a configured happy-path regression where search returns `bbbbbbbb-0000-0000-0000-000000000001` and detail returns the same row, plus malformed and missing-row checks. Keep tests focused on returned/rejected behavior, not mock invocation counts. Run focused Vitest and record expected failures before edits.
- [ ] Remove only configured-error fallback branches from all four helpers; retain error logging and rethrow. Update obsolete comments. Accept canonical UUID text with:

```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

- [ ] Add the minimal jobs error boundary using existing classes and Link. Render heading `공고를 불러오지 못했습니다.`, a short temporary-failure explanation, `다시 시도 / Retry` calling retry and `공고 목록으로` linking `/jobs`. Do not display error objects or application-submission advice. Verify accessible alert/heading/retry using an existing test pattern.
- [ ] Add a browser regression that starts at `/jobs`, clicks a visible job card, checks the matching detail heading, and checks the apply entry is present. Use the existing demo suite and fixtures; no auth/provider action.
- [ ] Run focused tests, the development browser suite, Next type generation, typecheck, lint and the full unit suite once. Record results and commit the changes.
- [ ] Incorporate the controller's actual isolated-stack/API/list/detail verification facts into the local guide without credentials. Do not imply an existing database was reset/upgraded, or that auth was restored.

## Controller runtime verification

- Preserve private env and retain both existing stacks. Prepare an ignored local CLI workspace for project `albamon-job-flow` with API 56321, DB 56322 and companion ports 56323–56327, copied migrations and fictional seed; verify ports unoccupied before starting. Never reset a retained stack.
- Verify 26 applied versions, public view columns, search/cities RPC and fictional list IDs. Correct private local API/key pairing without changing auth provider flags, and restart the relevant app process.
- Browser-check an actual DB list click, detail, search/empty state, missing ID, and signed-out apply entry. Verify configured unavailable runtime shows the error boundary rather than sample results. Check `/api/ready` succeeds on the restored runtime.
- Retain the separately named development stack and document exact restart instructions; remove only temporary test processes/files. Finish with verified commit/branch and accessible app.
