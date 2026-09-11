# D2 release candidate — local evidence, public NO-GO

Recorded 2026-09-11 UTC. Tested source: `332f704a37abb7475fc250c2b3c9466440107c76`
(base `dd1b5ed50b015e37eb7f8d046de3321d89fa03cd`). Node 22.23.1,
npm 10.9.8, Supabase CLI 2.109.1, Next 16.3.4. Environment: owned local
`albalmon-ca-launch` (API55321/DB55322), canonical `http://127.0.0.1:3100`,
indexing disabled. This is not a deployed staging/production identity.

**Public release is NO-GO / UNVERIFIED.** No actual operator, domain, support
mailbox, legal approval, Google/provider or hosted project has been invented.
`npm run build:release` actually exited 1 on 2026-09-11 with
`Missing release setting: NEXT_PUBLIC_SITE_URL`. Synthetic positive validator
fixtures do not change that result.

## Candidate and checks

The configured artifact was deliberately rebuilt after the unconfigured artifact
check; the D1 staging-shaped `.next` was not reused. Build ID
`4VRQg6qIlBRw61B7BHQal`, immutable archive SHA-256
`dd8fa8b2129e006124ac1b93c2df311de26cbc694e5e8aacb4e7c0ecc2f86913`.
A scan of 1,125 artifact files found no service key. The archive contained `.next`
(excluding cache/trace), public files, package metadata and Next configuration.
The final browser run served a fresh extraction of this exact archive after the
rollback rehearsal, with no intervening rebuild. See [restore and artifact
identity evidence](restore-drill.md).

All commands below ran locally on 2026-09-11 with Node22 first in PATH. Source was
frozen at the commit above for final artifact/restore/rollback/browser checks.
The full unit run preceded the final browser-only cleanup/expired-session edits;
covering Auth tests and the final whole browser suite verified those edits.

| Command/check | Actual result |
|---|---|
| `npm ci` | PASS: 416 installed / 417 audited, zero vulnerabilities |
| `npx next typegen`; `npm run typecheck`; `npm run lint` | PASS; generated types explicitly precede fresh-checkout typecheck |
| `npm test` | 734 PASS, 6 opt-in skips; 66 passing files / 2 skipped; 12.62s |
| `npm run test:db` | 10 files, 498 assertions PASS on source; 5s |
| `npm run test:notifications:local` | 5/5 PASS, 15.12s; actual local Auth/DB and loopback provider double |
| `RUN_PRIVACY_LOCAL=true npm test -- tests/privacy-requests-local.test.ts tests/private-export-disposal.test.ts` | 2/2 PASS, 2.41s |
| `npm run check:production-artifact` | Fresh unconfigured build/start PASS; sample and malformed job IDs 404 |
| `npm run verify:beta`; `npm run verify:local-supabase` | 7/7 PASS each; offline checks only |
| `npm audit --audit-level=high`; `npm audit --omit=dev --audit-level=high` | Both zero vulnerabilities |
| Full Playwright suite, same testDir/projects as `npm run test:e2e`, webServer cwd set to extracted rollback artifact | 27/27 PASS, 21.9s; final shutdown 07:48:01.320–327 UTC; five stream warnings |
| `npm run build:release` | BLOCKED as expected by absent actual release setting; not PASS |

Compatible dev remediation used `npx --yes npm@11.11.0 update vitest
@tailwindcss/postcss tailwindcss postcss brace-expansion browserslist js-yaml
--package-lock-only` after npm10 update/audit-fix/install attempts failed inside
Arborist (`edgesOut` of null, optional Vitest browser peers). No force, overrides,
global npm install, package.json range change or runtime/framework upgrade.
Resolved Vitest4.1.11, Tailwind4.3.3, PostCSS8.5.28, brace-expansion1.1.18/5.0.9,
Browserslist4.28.9 and js-yaml4.3.2 with compatible transitive updates.

## Fault and regression evidence

- Privacy disposal RED: a throwing database cleanup left a protected toy export
  directory. GREEN: nested finally removes it and preserves the exact original
  error; the real local privacy export/delete/suppression rehearsal also passes.
- Mobile RED at 390×844 with a synthetic 34px bottom inset: sticky action bottom
  764px exceeded nav top756.5px (7.5px overlap). Shared `--mobile-bottom-offset`
  fixes both page reserve and sticky positioning: bottom730px, clearance26.5px.
  The regression substitutes the actual CSS `env()` expression through CSSOM;
  CDP safe-area injection was unavailable. This is Chromium geometry, not a
  physical iPhone measurement.
- An isolated invalid-public-key build returned ready503 and rendered the actual
  generic error boundary; key absent from body. An isolated root-layout fault
  rendered the actual global fallback and recovered with Retry after removal of
  its local fault file. Observations 07:39:48.827–50.523 UTC, 210ms/179ms respectively.
  No crash route, runtime probe or fault flag is shipped in source.
- Expired cookie plus revoked real local Auth session returned to
  `/login?next=%2Fdashboard` (1/1 PASS, 2.5s). The expected refresh-token-not-found
  diagnostic contained no credentials. Forced closed-page cleanup failed at the
  intended navigation seam but disposed both test users and their audit entries;
  normal covering Auth tests passed 4/4, 29.7s.
- Notification fault tests prove business commits survive provider503, lease
  recovery/lost completion, concurrent claims/idempotency, duplicate signed
  webhook handling and suppression. These are local doubles, not real mail.
  Browser/SQL tests cover repeated stale state conflict, authorization, retained
  application/message history, actual local AAL2 admin actions and policy CAS.

## Stream warning — unresolved, not waived

The initial source suite passed26/26 with two warnings. An intrusive diagnostic
probe then passed20 and failed6 (1.5m); its overhead affected timing. Three of four
warnings correlated with pending prefetch RSC requests at blank-navigation/close;
one correlated with document navigation. This is not root-cause or harmlessness
proof. A supported narrow server/browser C2 probe passed1/1 (16.5s), no warning,
no pending request at teardown. A later C2+B3 probe had three setup timeouts and
an observed 07:01:08→07:16:09 wall-clock gap; its cause was not established.
The final candidate suite passed27/27 and still emitted **five** warnings before
server termination. User impact remains unresolved for final review/D3.
No log suppression, arbitrary sleeps or framework campaign was used.

Failed probes were cleaned with exact IDs selected once inside asserted-count
transaction-local tables using closed probe intervals and exact owned prefixes:
2 profile actors and their dependencies, 1 separately correlated callback audit,
then 4 partial b3/c2 actors with zero owned companies. No baseline IDs were
selected for deletion. Final baseline is 3 Auth users/3 profiles/3 companies/
13 jobs (11 public)/11 business audits; applications/messages/reports/access
requests/outbox/receipts zero, all eight acknowledgement columns null, existing
policy pointer unchanged. Managed Auth audit logs from login activity remain;
this is not a claim the entire Auth database is byte-identical after testing.

## Binding release gate

| Required gate | Evidence boundary |
|---|---|
| Production mocks absent; vulnerability response | Local artifact regression PASS; both fresh audits zero; actual deployment still needed |
| Login/roles/admin | Local Auth/AAL2 and isolation PASS; **actual Google UNVERIFIED** |
| CA city/pay search; full job lifecycle | Local final browser/SQL PASS |
| Applications/messages; reporting/suspension/audit | Local final browser/SQL PASS |
| Notifications | Local retry/dedupe/suppression PASS; **actual sender DNS, inbox, signed provider webhook and cron UNVERIFIED** |
| Four policies/privacy/support | Local current-identity acknowledgements and privacy rehearsal PASS; **real text review/support intake UNVERIFIED** |
| Mobile/accessibility | Chromium390/1440 and keyboard/error checks; bounded earlier native Safari evidence in browser-qa; **physical iOS and full authenticated native Safari journey UNVERIFIED** |
| Health/recovery | Local faults, exact logical restore and same-identity rollback PASS; **actual monitor alert, hosted backup/PITR, RPO≤24h/RTO≤4h and Vercel rollback UNVERIFIED** |
| Real supply | **UNVERIFIED**: representative-confirmed ≥10 businesses and 20–30 actual public jobs; never substitute samples |

Deployed domain/Search Console and actual staging/production environment identity,
protection, migrations and operator sign-off remain external gates. Follow
[deployment](../DEPLOYMENT.md), [environment evidence](environments.md),
[browser evidence](browser-qa.md), [policy review](../legal/launch-policy-review.md)
and [operational health](../OPERATIONAL_HEALTH.md). Passing local tests does not
satisfy missing external rows.
