# Live authorization and browser evidence — A3

A3 uses real PostgreSQL API roles and Chromium against an isolated, seeded local Supabase stack. No hosted database is reset or seeded. These checks establish the current authorization foundation; they are not a production launch approval.

## Matrix implemented

`supabase/tests/database/launch_rls.test.sql` runs 103 pgTAP assertions in one transaction and rolls everything back. Privileged existence assertions establish the private target rows before negative role checks, so an empty fixture cannot masquerade as successful isolation. Claims select the real `anon`/`authenticated` database roles; they do not mock an application authorization helper.

| Caller | Verified access | Verified denial / non-disclosure |
| --- | --- | --- |
| anon | Approved jobs in base table and public view; safe company identity, including an unverified company with an approved job | Pending jobs in both read paths; company base-table/private-column access; profiles, applications, messages, reports/reporters, audit logs |
| seeker A | Own application creation and history, own application messages, authenticated public view | Seeker B application/profile/messages, another thread write, duplicate application, submission as B, pending-job submission, private company row, self-promotion to employer/admin |
| employer A | Own full company read/update; own pending job read/edit; own applicant through table and listing RPC; own applicant messages | Employer B company read/update, applicants through table/RPC, messages/read/write; self-approval; verification change; reporter identity; audit logs |
| employer B | Public read model remains shared | Employer A pending job and private profile |
| admin aal1 | Own profile used by account/security flows | **A4 pending:** privileged mutations must require AAL2; A3 does not claim they are blocked |
| admin aal2 | All companies and private fields; company update; job approval; applicants/messages; report read/review; audit reads | An authenticated role with AAL2/admin metadata but no subject cannot become admin, read report/audit rows, or review reports; anon table grants remain denied |
| demoted employer | Own profile retained | Old ownership cannot grant private company/applicant/message reads, employer RPC access, company/job updates, new company/job creation, or messages to former applicants |
| suspended user | **A4/C2 pending:** status and retained-history contract | **A4/C2 pending:** suspension-aware write denial and quotas; these capabilities do not exist at A3 |

AAL1 mutation denial, MFA enrollment/verification, and account suspension/sanction semantics are intentionally not represented by skipped or passing placeholder tests. A4 and C2 must add real assertions when those capabilities ship. Actual provider OAuth must be verified separately in D2; no provider is mocked or claimed as tested here.

## Public company contract

Migration `20260909000050_private_company_access.sql` drops the verified-company public read policy and revokes company `SELECT` from `public`/`anon`. Existing authenticated owner/admin grants and policies remain usable. Restricting only anon would leave private fields exposed to signed-in non-owners.

Public callers use `public_job_listings`, which exposes approved job fields plus `company_name` and `company_is_verified`. Its column allowlist is checked in PostgreSQL. The existing postgres-owned view intentionally supplies underlying-table access; changing it to `security_invoker` requires revisiting this design. The job's displayed address remains part of the existing job projection; private company owner/contact/address fields are not added to it.

Playwright additionally calls real anonymous REST: the view returns eight seeded approved rows, while `companies?select=owner_id,phone` returns SQLSTATE `42501`. HTTP mapping can differ by caller, so both a failed response and the SQL error code are asserted. The browser sees the Korean jobs heading, a seeded UUID link and company name, and no pending/draft links. Employer, admin, and seeker-history entry routes redirect signed-out users to login with a safe return path. Existing parent layouts can return the area home before the nested page guard executes.

## Reproduce from a clean checkout

Prerequisites: Docker running, Node 22 (`nvm install && nvm use` uses `.nvmrc`), Supabase CLI **2.109.1**, and ports 55321–55329 and 3100 available. The tracked project ID is `albalmon-ca-launch`; it is separate from the original `k-work-us` stack on 543xx and native PostgreSQL on 5432. Run from this repository root. Never pass a hosted DB URL or `--linked` to reset/test commands.

```bash
npm ci
supabase start > /dev/null
supabase db reset --local
npm run test:db
npx playwright install --with-deps chromium

# Only export the local public URL and anon key; no service-role browser input.
# These substitutions capture values without printing them. Do not use shell tracing.
export NEXT_PUBLIC_SUPABASE_URL="$(supabase status -o json | node -e 'let s=""; process.stdin.on("data", x => s += x); process.stdin.on("end", () => process.stdout.write(JSON.parse(s).API_URL));')"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status -o json | node -e 'let s=""; process.stdin.on("data", x => s += x); process.stdin.on("end", () => process.stdout.write(JSON.parse(s).ANON_KEY));')"
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
supabase stop --no-backup
```

Playwright refuses any Supabase URL other than `http://127.0.0.1:55321`. It starts the production artifact on 127.0.0.1:3100, waits for `/api/ready`, and stops its server when finished. An already-running app is not reused. Traces are disabled to avoid recording API keys; generated results are ignored. There is no dependency on ignored SDD files or a pre-existing environment file.

CI installs the pinned CLI, starts and resets only the tracked disposable project, executes pgTAP, captures only the local public variables directly into the job environment without logging credential values, installs Chromium, builds, and runs Playwright. `if: always()` stops that project even on failure. No service-role credential or stored repository secret is needed. A GitHub-hosted run is separate evidence; local execution does not claim a remote Actions result.

## A3 recorded result

On 2026-09-09, Node 22.23.1, Supabase CLI 2.109.1/PostgreSQL 15, Playwright 1.63.0/Chromium 153 (revision 1243): 103/103 live SQL assertions and 5/5 browser/API checks passed after applying the new migration. The company regression first failed on the uncorrected database: anon retained `SELECT`, and selecting `owner_id,phone` raised no exception. After the correction it passed with SQLSTATE 42501, while public identity and owner/admin workflows remained accessible.

References: [Supabase CLI testing](https://supabase.com/docs/reference/cli/supabase-test-db), [Supabase CI testing](https://supabase.com/docs/guides/deployment/ci/testing), [Playwright web server](https://playwright.dev/docs/test-webserver), and the installed Next.js 16.3.4 `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` guide.
