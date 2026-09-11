# 대표 인수인계 — California 공개 출시

**소프트웨어 구현과 로컬 배포 준비는 완료했습니다. 실제 production 배포·공개·첫 24시간 관찰은 NOT RUN / NO-GO입니다.** K-Work US는 무료 CA 구인·구직, 공고 심사/수정/마감, 지원/철회/대화, MFA 관리자/신고/정지, 알림 재시도·수신 차단, 정책 확인 기록과 운영 지표를 구현했습니다. 운영자·지원 메일·도메인은 미정이며 임의로 채우지 않았습니다.

후보는 `codex/california-public-launch`, 작업 위치는 `/Users/rinny/IdeaProjects/AlbaMon/.worktrees/california-public-launch`입니다. 최종 로컬 증거는 unit **734 PASS + 6 opt-in skip**, 원본/복원 DB **각 498 PASS**, 최종 브라우저 **27/27 PASS**, 전체/운영 audit **각 0**입니다. 브라우저에는 원인·사용자 영향이 미해결인 stream 경고 5건이 있습니다. 이는 실제 Google·메일·호스팅 PASS가 아닙니다.

다음 실제 단계는 운영자/연락처/도메인과 기존 프로젝트 선택 → 정책 외부 검토 및 실제 계정·메일 승인 → 아래 대상 확인/백업/`db push --dry-run` → 검토된 `db push` → 별도 Production 새 빌드 → 실제 smoke/복구/공급 증거 → 대표의 공개 Go입니다. 첫날 이후에는 [첫 30일 운영표](../operations/first-30-days.md)를 사용합니다. 이미 미정이라고 답한 입력을 다시 확정된 사실로 취급하지 않습니다.

## 후보 식별과 검증 범위

| 기록 | 실제 값 / 상태 |
|---|---|
| D3 준비 기준 commit | `8c83538a60909601411528c6e169138202165b44` (D2 문서) |
| 실제 테스트 artifact의 source commit | `332f704a37abb7475fc250c2b3c9466440107c76` |
| 로컬 candidate A build ID | `4VRQg6qIlBRw61B7BHQal` |
| 로컬 A archive SHA-256 | `dd8fa8b2129e006124ac1b93c2df311de26cbc694e5e8aacb4e7c0ecc2f86913` |
| 로컬 환경 | Node22.23.1 / npm10.9.8 / Next16.3.4 / Supabase CLI2.109.1; API55321/DB55322; canonical `http://127.0.0.1:3100`, indexing=false |
| 현재 소스/로컬 DB 정책 | `draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7` — 검토/공개 승인 아님 |
| D3 인수인계 문서 commit 확인 | `git log -1 --format=%H -- docs/launch-evidence/production-release.md` |
| 실제 배포 commit / deployment ID / URL | **NOT RUN / UNVERIFIED**; 위 로컬 build ID를 기입하지 않음 |
| 실제 Vercel project/team / Supabase production ref / region | **UNSELECTED** |
| 실제 canonical domain / TLS / redirect / support | **UNSELECTED / UNVERIFIED** |
| 실제 공개 사업장 수 / 공고 수 / 공개 Go 주체·UTC | **UNKNOWN / UNKNOWN / NOT GIVEN** |

정확한 명령·시간·실패 시도는 [D2 candidate](release-candidate.md), [복원/rollback](restore-drill.md)에 있습니다. 2026-09-11 최종 브라우저는 A를 새로 추출해 21.9초에 27개를 통과했고 07:48:01.320–327 UTC에 종료했습니다. full unit은 최종 browser-only 정리/세션 검사 수정 이전 실행이며 후속 해당 Auth 검사와 최종 전체 browser가 그 변경을 검증했습니다. 서비스 키는 artifact 1,125개 파일 검사에서 검출되지 않았습니다.

복원은 14개 catalog/data manifest 일치, 15개 FK 검사 및 실제 복원 Auth 로그인까지 통과했습니다(07:46:23.793 UTC, 복원 시작부터 114.070초). A → 같은 source에 고립된 root fault를 넣은 **서로 다른 B** → digest 확인 후 새 추출 A를 실제로 서비스했고, 이력 hash 보존·새 메시지·공고 수정/재심사·철회를 확인했습니다(전환 1,003ms). 이는 이전 hosted release나 정책 전환 검증이 아니며 **hosted RPO≤24h/RTO≤4h 증거가 아닙니다.** 폐기한 로컬 archive를 실제 복구 자산으로 지정하지 않습니다.

D3 문서 변경 후 2026-09-11 UTC, 같은 worktree/Node22에서 수행한 확인:

| D3 명령 / 범위 | 실제 결과 |
|---|---|
| `npm run verify:beta`; `npm run verify:local-supabase` | 각7/7 PASS, nested docs 비밀 패턴 검사 포함 |
| `shasum -a 256 -c docs/launch-evidence/migrations.sha256` | 현재21개 모두 OK; 별도 목록 대조로 누락/추가 없음 확인 |
| 변경 Markdown의 로컬 파일/anchor 검사; `git diff --check` | 연결 오류0 / whitespace 오류0 |
| `npm run verify:deploy-target -- production` | exit1: `Missing or invalid staging project ref` — 두 환경 tuple을 검사하며 실제 refs가 미선택 |
| `npm run build:release` | exit1: `Missing release setting: NEXT_PUBLIC_SITE_URL`; Next build 진입 전 차단 |

이 실패들은 올바르게 닫힌 **현재 NO-GO 증거**입니다. 실제 hosted smoke/link/push/배포를 실행하지 않았고, 문서만 바뀌어 DB/browser/restore 전체 검사를 다시 돌리지 않았습니다.

## 정확한 migration 기록

현재 후보는 아래 **21개** ordered migration을 포함합니다. 각 파일의 exact SHA-256은 [migrations.sha256](migrations.sha256)에 있습니다. D3는 migration을 추가하거나 과거 파일을 변경하지 않았습니다. 이 목록은 **source inventory**이며 실제 운영에 pending인 목록은 remote history/dry-run 전에는 알 수 없습니다.

```text
20260621000000_init_schema.sql
20260622000000_audit_hardening.sql
20260623000000_application_submission.sql
20260624000000_application_listing_functions.sql
20260625000000_employer_write_hardening.sql
20260626000000_application_messages.sql
20260627000000_application_status_workflow.sql
20260628000000_report_queue_hardening.sql
20260706000000_employer_access_requests.sql
20260707000000_explicit_table_grants.sql
20260909000050_private_company_access.sql
20260909000100_profile_and_admin_security.sql
20260909000200_ca_job_search.sql
20260909000300_job_lifecycle.sql
20260909000400_application_lifecycle.sql
20260909000500_notification_outbox.sql
20260909000510_notification_claim_recovery.sql
20260909000600_abuse_controls.sql
20260909000700_policy_acknowledgements.sql
20260909000710_policy_publication_identity.sql
20260909000800_marketplace_signals.sql
```

저장소 root에서 `shasum -a 256 -c docs/launch-evidence/migrations.sha256`로 검증합니다. 원래 10개에서 추가된 11개는 회사 비공개 권한, MFA, CA 검색, 공고/지원 수명주기, 알림, 제재, 정책 identity, 집계 기능입니다. 함수/권한/쓰기 조건도 바뀌므로 파일 추가 방식만으로 이전 앱 호환을 추정하지 않습니다. 원격의 실제 pending 파일·version/name/statements와 dry-run 결과를 따로 기록합니다.

## 실제 실행 순서 — 현재 모두 외부 실행 대기

### 1. 대상·기존 데이터·백업 (D3.1)

[D1 inventory/환경 분리](../DEPLOYMENT.md#inventory-before-any-hosted-mutation)와 [변수 표](../PRODUCTION_ENV_VARS.md)를 사용해 기존 계정을 먼저 확인합니다. CLI 로그아웃/대시보드 로그인 화면이라는 앞선 관측은 기존 프로젝트나 사용자가 없다는 증거가 아닙니다. 실제 project/team/ref/region/plan, 이전 배포, 전체 migration history, 백업 범위/Auth 포함 여부/보존 기간/최근 성공 시각/복구 가능 지점과 별도 recovery target을 보호된 기록에서 확인합니다. schema 변경 직전 백업 및 복구 검증이 없으면 진행하지 않습니다.

[read-only inventory SQL](environment-inventory.sql)은 검증한 프로젝트의 보호된 read connection/SQL editor에서 실행합니다. 이전 schema에는 존재하는 컬럼의 쿼리부터 적용합니다. [기존 CA/급여/도시 및 publication 재검토](environments.md#existing-data-inventory)로 approved/null-expiry와 실제 게시일 불명을 확인합니다. phone-only 계정은 [Auth의 별도 count SQL](auth-mfa.md#hosted-settings-and-trusted-operations)을 사용하고, 알려진 seed/회사/계정 여부는 실제 source와 대조합니다. 확인된 실제 공고만 정상 재심사하고, 미확인 행은 공개 중지합니다. 임의 날짜/급여 보정이나 모든 테이블 삭제로 fixture를 정리하지 않습니다.

기존 사용자가 있으면 영향·변경 안내를 먼저 준비합니다: 무료 CA 범위, 공고 수정 후 재심사/마감·만료, 기존 지원/대화 보존, 현행 정책의 다음 행위 시 명시적 재확인, 지원 채널, 계획된 작업 시간과 문의 방법. 실제 수신 대상/승인자/내용/발송 채널/시각/수신 증거를 제한된 기록에 남깁니다. 현재 초안은 발송되지 않았고 기존 사용자 유무도 UNKNOWN입니다.

검토용 안내 초안(미발송; 대괄호를 실제 승인된 값으로 채운 뒤 대상별 검토):

> [실제 작업 일시/PT] K-Work US의 캘리포니아 무료 구인·구직 기능을 업데이트합니다. 공고 내용 수정은 재심사를 거치며, 마감·만료 공고에는 새로 지원할 수 없습니다. 기존 지원과 대화 이력은 유지합니다. [실제 적용일/정책 링크]의 안내를 확인해 주세요. 필요한 다음 행위에서 정책 확인을 요청하며, 과거 이용을 새 정책 동의로 일괄 처리하지 않습니다. [실제 영향/예정 작업 시간] 동안 이용에 미치는 영향과 문의는 [실제 지원 채널]에서 안내합니다.
>
> K-Work US remains free for California job seekers and employers. Edited listings require review; closed or expired listings stop accepting applications. Existing application and message history is retained. Please review [approved policy link/effective date]. Contact [verified support channel] about [confirmed maintenance impact/time].

### 2. production additive migration (D3.2)

Node22를 사용하고 실제 선택된 값만 보호된 operator environment에 로드합니다. 아래 블록은 **각 명령 실패 시 중단**하며, link 직후 콘솔의 project/ref를 다시 대조합니다. 비밀번호·키를 인수나 셸 history에 넣지 않습니다.

```bash
(
set -e
test -n "$PRODUCTION_PROJECT_REF"
npm run verify:deploy-target -- production
supabase link --project-ref "$PRODUCTION_PROJECT_REF"
test "$(cat supabase/.temp/project-ref)" = "$PRODUCTION_PROJECT_REF"
supabase migration list --linked
shasum -a 256 -c docs/launch-evidence/migrations.sha256
supabase db push --dry-run
)
```

실제 대상·예정 변경·백업·기존 데이터 영향·dry-run을 대표가 검토한 뒤에만 다음 블록을 실행합니다. remote-only/missing history, destructive SQL 또는 예상하지 않은 차이는 중단 사유입니다. `reset`, `seed`, `--include-seed`, 강제 history repair로 해결하지 않습니다.

```bash
(
set -e
npm run verify:deploy-target -- production
test "$(cat supabase/.temp/project-ref)" = "$PRODUCTION_PROJECT_REF"
supabase db push
supabase migration list --linked
)
```

적용 후 같은 inventory를 다시 비교하고 권한/정책/이력 보존을 확인합니다. 정책은 [검토된 facts/prose·archive·notice·CAS](../legal/launch-policy-review.md) 순서대로 별도 활성화합니다. 캡처한 expected identity가 충돌하면 자동 갱신하지 않습니다. 사용자·공고의 과거 동의를 backfill하지 않습니다.

### 3. 새 Production build와 staged URL (D3.3)

실제 Google/Supabase callbacks, admin TOTP/AAL2, 검토된 정책 identity, [sender/DNS/inbox와 알림 복구](../OPERATIONAL_HEALTH.md#email-activation-and-queue-recovery--unverified)를 먼저 검증합니다. 실메일 테스트는 별도의 명시적 승인과 대표 소유 테스트 주소가 필요합니다. 현재 승인/발송은 없습니다.

실제 Vercel의 project/team 연결 및 hosted Build Command=`npm run build:release`를 확인합니다. **Vercel Production → production**, Preview → staging이며 refs/origins는 서로 다릅니다. Production은 `EMAIL_ENVIRONMENT=production`, indexing=true, `NEXT_PUBLIC_SITE_URL=PRODUCTION_ORIGIN`으로 새로 빌드합니다. 기존 local/Preview artifact를 재지정하지 않습니다.

```bash
(
set -e
test -n "$VERCEL_TEAM"
test -n "$VERCEL_PROJECT"
test -z "$(git status --porcelain)"
git status --short
git rev-parse HEAD
npm run verify:deploy-target -- production
npm run build:release
npx --yes vercel@59.13.1 deploy --prod --skip-domain --scope "$VERCEL_TEAM"
)
```

실제 반환 URL을 작업 기록과 `STAGED_PRODUCTION_URL`에 지정하고, 같은 team/project의 방금 생성한 Production deployment인지 확인한 뒤:

```bash
(
set -e
test -n "$STAGED_PRODUCTION_URL"
test -n "$VERCEL_TEAM"
npx --yes vercel@59.13.1 inspect "$STAGED_PRODUCTION_URL" --scope "$VERCEL_TEAM"
DEPLOYMENT_ORIGIN="$STAGED_PRODUCTION_URL" npm run smoke:deployment -- production
)
```

명령은 승인된 clean checkout의 정확한 release SHA에서 수행합니다. 실제 facts/소스/설정이 달라지면 해당 변경의 검증과 새 artifact identity를 남깁니다. 배포 ID, source SHA, build ID/log reference, 실제 env target, compiled public 설정, policy identity, migration manifest를 서로 묶습니다. 로컬 `build:release` 성공만으로 hosted override/build 성공을 대신하지 않습니다.

`--skip-domain`은 도메인 자동 연결만 늦춥니다. 접근 보호나 이메일/cron 중지를 보장하지 않으므로 unique Production URL의 공개 전 접근 보호와 production queue/scheduler 영향을 실제로 확인합니다. 보호할 수 없는 미검증 artifact를 공개하지 않습니다. **요청 URL은 STAGED_PRODUCTION_URL, compiled canonical/메일 origin은 미래 PRODUCTION_ORIGIN**입니다. smoke를 통과하려고 canonical을 unique URL로 바꾸지 않습니다. [Vercel deploy 문서](https://vercel.com/docs/cli/deploy)를 2026-09-11 확인했습니다.

### 4. 실제 smoke와 공개 Go (D3.4–D3.5)

read-only smoke는 health/ready/jobs, canonical, robots/sitemap, sample/seed 비노출 및 잘못된 worker 인증 거절을 검사합니다. 올바른 worker 인증이나 signed webhook을 보내지 않습니다. **인증된 GET `/api/internal/notifications`는 claim·메일 발송을 하는 쓰기 작업**입니다. 별도 승인된 실제 계정 여정/메일 테스트와 구분하고 dry-run으로 부르지 않습니다.

실제 Google 신규/재로그인/취소/만료/지원 복귀, seeker 2명·employer 2명·admin 1명의 MFA/승인/지원/중복/타인 차단/메시지/철회/마감, 실수신/재시도/서명 suppression을 검증합니다. [browser/device 범위](browser-qa.md)의 physical iOS·인증된 native Safari·성능 측정과 실제 monitor 경보, hosted 복원/rollback도 미검증입니다. 알려진 seed UUID/샘플 이름/`kw-001`이 public HTML/JSON/sitemap에 없고 대표 확인 실제 CA 사업장 ≥10개/공고 20–30개를 확보했는지 원시 수량·확인일과 함께 남깁니다. 이는 운영 목표이며 부족분을 샘플로 채우지 않습니다.

필수 [Go/No-go 표](release-candidate.md#binding-release-gate), [공개 체크리스트](../LAUNCH_CHECKLIST.md), 아래 미해결 리뷰의 판정까지 실제 증거가 있어야 대표가 공개 Go를 기록합니다. 도메인 소유/DNS/TLS/HTTP→HTTPS 및 별칭→canonical redirect를 확인하고, 정책 적용/사용자 영향 안내를 준비한 후 **승인된 staged Production artifact만** 공개합니다.

```bash
(
set -e
test -n "$STAGED_PRODUCTION_URL"
test -n "$VERCEL_TEAM"
test -n "$VERCEL_PROJECT"
npm run verify:deploy-target -- production
npx --yes vercel@59.13.1 promote "$STAGED_PRODUCTION_URL" --scope "$VERCEL_TEAM"
npx --yes vercel@59.13.1 promote status "$VERCEL_PROJECT" --scope "$VERCEL_TEAM"
DEPLOYMENT_ORIGIN="$PRODUCTION_ORIGIN" npm run smoke:deployment -- production
)
```

`promote`는 [기존 deployment를 current로 지정](https://vercel.com/docs/cli/promote)합니다. 명령 timeout은 취소 증거가 아니므로 상태를 확인한 뒤 판단합니다. 공개 후 canonical에서 무인증 접근, 가입/탐색 무료, 공고/고용주 별도 심사 안내, 정상 redirect/robots(index 허용)/sitemap, TLS, OAuth 복귀와 메일 origin을 다시 확인합니다. Search Console/URL Inspection은 실제 domain 증거로 기록하며 검색 노출을 보장하지 않습니다. 실패하면 [첫날 containment/rollback](../operations/first-30-days.md#장애-대응과-복구)을 적용합니다.

### 5. 실행 기록 (D3.6–D3.7)

첫 24시간 관찰/자동화는 시작하지 않았습니다. 공개 T0 이후 [운영표](../operations/first-30-days.md)로 실제 관찰을 기록합니다. 아래 행은 현재 전부 **NOT RUN**이며 값이 없는 칸을 로컬 증거로 채우지 않습니다.

| 실제 실행 기록 항목 | 반드시 보존할 비밀 없는 증거 |
|---|---|
| 백업/대상/schema | UTC, operator, project/ref/region, backup point/age/coverage, recovery test ref, before history/counts |
| dry-run/적용 | exact release SHA, ordered pending versions+hashes, reviewed SQL reference, reviewer, command/exit, after history/counts |
| Production build | immutable deployment URL/ID, source SHA/build ID, real target, compiled canonical/indexing, policy identity, protected build evidence |
| smoke/provider/device | UTC, request URL와 canonical 각각, 시나리오/역할, 상태/결과, 실제/fixture 구분, 승인된 발송 reference |
| public Go/promotion | 대표의 명시적 결정·UTC, gate별 증거, 실제 확인 공급 수/날짜, 변경 안내 결정, domain/redirect/TLS 결과 |
| 첫 24시간 | T0/T+1h/+4h/+12h/+24h 관찰, 장애/ack/recovery 시각, 비용/queue/report 추이, 실제 담당자 |
| rollback/종료 | 정확한 이전 hosted artifact/source/policy, history/write 검사, active cron, 복구 시간/남은 손실, 잔여 이슈/담당/다음 판단 |

## 남은 리뷰 항목과 처리 상태

각 task의 로컬 review는 Critical/Important 0으로 종료했지만 최종 whole-branch review와 아래 Minor의 출시 영향 판정은 별도입니다. **미해결 P2를 0이라고 선언하거나 경고를 면제하지 않습니다.** 아래 ID는 기존 ledger를 합친 것이며 새로운 결함 판정을 만들어내지 않습니다.

| ID / 수준 | 실제 잔여 상태 | 다음 판단 / 책임 |
|---|---|---|
| B1-M1 / Minor | page500 sentinel로 page501 링크가 나타나 app이1로 되돌림; 공개 재고 >10,000 경계 | final reviewer가 영향/수정 여부 판정; 도달 규모 전 paging 개선 |
| B1-M2 / Minor | direct search RPC의 invalid page501→500, app parser→1 규약 차이 | final reviewer; 통일 시 새 migration 및 경계 회귀 |
| B1-M3 = C2 stream = D2-M1 / Minor | 최종27PASS에도 종료 전 stream 경고5건, 원인/사용자 영향 UNRESOLVED | final reviewer/개발 담당; actionable 재현 시 제한된 sanitized correlation, 무작정 전체 재실행/로그 억제 금지 |
| C4 openness / Minor | owned job마다 `is_job_open` RPC, 한 요청 실패가 목록 실패로 전파 | final reviewer; 실제 규모/지연 근거가 있으면 batching, 동일 공개 predicate와 owner 이력 보존 |
| DB-NOTICE / runner 정보 | pgTAP extension setup notice와 NO_COLOR/FORCE_COLOR 경고는 기존 알려진 setup/runner 출력 | assertion 실패나 stream 경고와 분리; 전체 로그 무음/원인 해결 주장 없음 |
| D2-M2 / Minor 기록 보존 | attempt5 DNS 원문 로그를 나중 시도가 덮어써 소실; 당시 관측만 남음 | [향후 per-attempt 기록 절차](restore-drill.md#repeatable-local-procedure) 추가 완료; 소실 로그는 복구되지 않음 |
| B2-M1 / 해결 | 만료 approved 공고의 owner public dead link | C4 `cec83805`가 authoritative openness 적용 |
| DEV-AUDIT / 해결 | compatible lock refresh 후 full/prod audit0 | D2 source `332f704`; 해당 시점 audit이며 영구 무취약 보장 아님 |
| C3 cleanup / 해결 | DB cleanup throw에도 보호 export 무조건 폐기 | D2 behavioral RED→GREEN + 실제 privacy2PASS |
| D1 activation / 해결 | sender/DNS/inbox/queue/idempotency 안내와 링크 복구 | D2 [운영 health](../OPERATIONAL_HEALTH.md#email-activation-and-queue-recovery--unverified); 실제 provider는 UNVERIFIED |
| failed browser fixture cleanup / 해결 | 실패한 navigation 뒤 Auth/audit 누수 | D2 nested finally/정확한 owned actors 정리 및 강제 실패 검증 |

intrusive 진단 20PASS/6FAIL, 이후 wall-clock gap의 3 timeout은 후보 PASS가 아닙니다. attempt5 JSON은 실패 단계·cleanup flags만 보존하며 DNS 원문이나 시도 전후 전체 source byte 비교를 증명하지 않습니다. backup capture 내부 hash 안정성과 이후 baseline/history 검사는 별도 근거입니다.

## 로컬 자원과 계획 상태

D2 최종 baseline은 Auth3/profiles3/companies3/jobs13/open11/business audit11/21migrations, applications/messages/reports/access requests/outbox/receipts0, 기존 8개 ack 컬럼 NULL과 현재 draft pointer입니다. 테스트 중 기존 로컬 13개 seed job의 `updated_at` revision token이 전진한 C3 편차는 남아 있으며 옛 토큰을 복원/조작하지 않았습니다. Auth 로그인 감사 로그도 자연히 남으므로 source 전체 byte 무변경이라고 하지 않습니다.

D2 보호 dump/export/immutable 복사본/563xx 복원 자원은 폐기됐고, 3100 서버는 없습니다. owned553xx stack, 원래543xx/native5432, feature worktree와 controller scratch는 보존합니다. scratch5/6 유용 증거는 [환경 증거](environments.md)에 큐레이션됐고 Git index에서 제외됐으며 local copies는 남아 있습니다. D3는 controller cleanup/통합 결정을 대신하지 않습니다. original main의 사용자 untracked plan 파일도 건드리지 않습니다.

네 [원본 계획](../superpowers/plans/2026-09-09-california-public-launch.md)의 substep checkbox는 실제 수행 범위로 정리했습니다. 혼합 단계는 소프트웨어가 완성돼도 hosted 실행·대표 리허설이 남으면 unchecked입니다. 체크 수는 공개 승인이나 전체 제품의 결함 없음 보증이 아닙니다.
