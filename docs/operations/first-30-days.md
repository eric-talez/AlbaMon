# 첫 30일 운영 — K-Work US / First 30 days

**상태: 운영 준비 문서. 공개 T0 없음, 관찰·고객 연락·자동화 실행 NOT RUN.** 실제 운영자, 대체 담당자, 지원 메일, 도메인, 비용 한도와 공개일은 미정입니다. [대표 인수인계/production 실행](../launch-evidence/production-release.md)의 실제 Go와 배포 후 시작합니다. 가입·탐색·고용주 이용은 무료이며 공개 근무지는 CA입니다.

## 담당과 기록

대표가 공개/중지/복구/대외 안내의 결정 담당입니다. 실제 이름·MFA 관리자 계정·연락 경로·부재 시 담당은 공개 전에 지정합니다. 대체 담당자가 없으면 신규 공고 승인과 공개 확대를 보류합니다. Codex가 상시 감시하거나 실제 고객 연락을 자동으로 보낸다고 가정하지 않습니다. 이메일/메시지는 별도 명시적 승인을 받은 뒤 보냅니다.

제한된 운영 기록에는 관찰 UTC(현지 일정은 America/Los_Angeles), 실제 deployment/source/policy identity, 신호/수량, 확인자, 사건 ID, 조치·결정·다음 확인 시각, 보호된 증거 reference만 남깁니다. 주소·비밀번호·토큰·지원/메시지 본문·신고자 정보를 공개 기록에 붙이지 않습니다. 최초 운영 예산과 경보 목적지는 UNKNOWN이며 임의 비용/연락처를 설정하지 않습니다.

## 공개 전 인계

- [ ] production 실행표의 실제 Google/역할/MFA, 정책/지원·개인정보, 메일/cron, 디바이스, backup/restore/rollback, domain 및 공개 Go 증거를 확인한다.
- [ ] 대표가 확인한 사업장 **최소10개**, **실제 공고20–30개**의 현재 모집·급여/일정·CA 위치·등록 허락·응답할 담당자를 확인한다. 실제 수량은 UNKNOWN이다. 운영 목표이며 시장 성과 보장치가 아니다.
- [ ] 기존 사용자 유무를 확인하고 영향/정책 재확인/작업 시간/지원 채널 안내를 준비한다. 실제 발송 내용·대상은 승인 후 보호된 기록에 남긴다.
- [ ] 외부 monitor를 health/ready/jobs에 1–5분 간격으로 연결하고 연속2회 실패 경보의 실제 수신·ack·회복을 staging에서 검증한다. Preview에는 platform cron이 없으므로 Production scheduler 증거를 별도로 확보한다.
- [ ] 실제 backup point/보존 범위, 별도 recovery project, 동일 active policy의 compatible hosted rollback artifact, 접근 권한·plan 지원·active cron 복구 절차를 확인한다.
- [ ] 아래 운영표를 대표가 리허설하고 연락 가능한 시간·부재 처리·비용 경보 한도를 정한다. 공개 전까지 외부 응답 약속으로 게시하지 않는다.

## 첫 24시간

T0는 실제 promotion과 대표 공개 Go의 시각입니다. 자동 monitor 외에 대표가 T0 직후, +1h, +4h, +12h, +24h에 수동 확인합니다. 다음 표는 앞으로 수행할 일정이며 지금 PASS인 관찰이 아닙니다.

| 신호 / 화면 | 판정과 다음 조치 | 기록 |
|---|---|---|
| `/api/health`, `/api/ready`, `/jobs`; 5xx | 연속2회 실패/timeout이면 즉시 incident 열기. health200만으로 DB 정상 판정 금지. public read smoke와 deployment 비교 | 마지막 정상, 최초 실패, 영향 route/status, ack/recovery UTC |
| 로그인/callback/세션 만료 | 실제 계정의 가입·지원 복귀 실패를 보고 Google/Supabase callback/활성 flag/origin 확인. MFA 문제를 role 우회로 해결하지 않음 | provider/route 범주·안전한 오류 code; cookie/query/token 없음 |
| 지원/메시지 저장 | 실제 본인 이력으로 저장/중복 확인. 이메일 실패와 DB 저장 실패 구분. uncertain 저장은 새 제출 전 이력 확인 | 사건 reference, 성공/실패/중복 수, 권한 영향 |
| `/admin` 알림 집계 | pending/oldest available/failed와10분 지연 표시 확인. 지연 또는 failed 증가 시 cron/provider/lease 조사 | aggregate 수, 가장 오래된 due 시각, stable error code; 주소/본문 없음 |
| `/admin/reports`, `/admin/jobs`, `/admin/users` | 사기·위협·선입금·권한 노출은 즉시 중지 우선. 신고 상태만 reviewed로 바꾸는 것은 공고 중지가 아님 | 사건/조치/audit reference와 이유, 오래된 미처리 수 |
| Vercel/Supabase/Resend 사용량·비용 | 출시 전 정한 한도 초과 또는 급격한 증가면 원인/유입/재시도 점검, 확대 중지 및 필요한 기능 제한. 쓰기 한도 무력화 금지 | 실제 dashboard 시각/누적·추정 비용/증가 원인/결정 |
| sample/canonical/sitemap | 샘플·타주·만료·중지 공고가 보이면 공개 중지 및 predicate/배포 대상 점검 | source/artifact/대상과 실패 분류 |

첫날 종료 기록은 실제 관찰 시각별 결과, 미처리 incident/보고/알림, 소요 비용, 다음날 담당과 판단을 포함합니다. 못 읽었으면 UNKNOWN, 관찰하지 않았으면 NOT RUN입니다. 새 recurring automation은 이 문서로 생성되지 않습니다.

## 장애 대응과 복구

1. **containment:** 데이터 손상·권한 노출이면 대표가 해당 기능/공개 접근과 신규 쓰기를 즉시 제한합니다. 공고는 AAL2 `/admin/reports`의 **공고 중지 후 검토 완료**, 계정은 `/admin/users`의 정지와 사유 기록을 사용합니다. 정지 완료 후 기존 JWT도 DB의 현재 상태로 새 쓰기가 차단되고 기존 지원/대화는 보존됩니다. 전체 장애용 maintenance toggle은 구현되어 있지 않으므로 선택된 호스팅의 접근 제한/트래픽 중지 방법을 공개 전 실제 검증합니다. 이메일 비활성화는 앱 전체 쓰기 중지가 아닙니다.
2. **메일 불확실성:** `EMAIL_NOTIFICATIONS_ENABLED=false`를 실제 해당 hosting scope에 적용하고 반영/진행 중 worker를 확인합니다. 이미 guard를 통과한 발송은 도착할 수 있습니다. pending/sending/lease/provider ID/frozen payload를 보존합니다. 완료 불명 건을 복제/수동 재발송하거나 attempts를 초기화하지 않습니다. [재시도·idempotency·suppression 절차](../OPERATIONAL_HEALTH.md#email-activation-and-queue-recovery--unverified)로 확인합니다. 올바른 인증의 worker GET와 signed webhook은 **mutating**이며 read-only 명령이 아닙니다.
3. **앱 rollback:** 실제 이전 immutable hosted artifact의 source/build/deployment ID, **현재 active policy identity 일치**, 현 schema에서 이력 읽기·새 쓰기 호환을 확인합니다. 아래 URL은 선택된 실제 compatible artifact이며 로컬 A의 폐기된 archive/Preview URL을 넣지 않습니다. 현재 알려진 이전 hosted artifact는 없습니다.

   ```bash
   (
   set -e
   test -n "$ROLLBACK_DEPLOYMENT_URL"
   test -n "$VERCEL_TEAM"
   test -n "$VERCEL_PROJECT"
   npm run verify:deploy-target -- production
   npx --yes vercel@59.13.1 inspect "$ROLLBACK_DEPLOYMENT_URL" --scope "$VERCEL_TEAM"
   # 대표의 incident 복구 결정과 artifact/policy/호환 확인 후:
   npx --yes vercel@59.13.1 rollback "$ROLLBACK_DEPLOYMENT_URL" --scope "$VERCEL_TEAM"
   npx --yes vercel@59.13.1 rollback status "$VERCEL_PROJECT" --scope "$VERCEL_TEAM"
   DEPLOYMENT_ORIGIN="$PRODUCTION_ORIGIN" npm run smoke:deployment -- production
   )
   ```

   [Vercel rollback](https://vercel.com/docs/cli/rollback)의 실제 plan/대상 지원을 확인합니다. timeout을 취소로 가정하지 말고 상태를 확인합니다. 호환 artifact가 없으면 접근 제한을 유지하고 검증된 수정본을 새 Production build합니다. 과거 약관을 조용히 재활성화하거나 DB reset으로 rollback하지 않습니다. rollback은 active cron을 갱신하지 않으므로 scheduler 대상/secret/queue를 별도 확인합니다.
4. **DB 복원:** 손상 의심 상태를 보존하고 확인된 backup을 **별도 recovery project**로 복원합니다. `npm run verify:deploy-target -- recovery`로 production/staging과 다른 실제 ref/origin을 검증합니다. [복원 runbook](../launch-evidence/restore-drill.md)의 schema/data/FK/RLS/grants/Auth/policy/audit/history 비교와 실제 로그인·이력·쓰기 검증을 수행하고 provider/OAuth/keys/env를 별도로 복구합니다. 로컬 명령을 그대로 production에 적용하지 않습니다. 실제 복구점 나이와 incident→복구 시간으로 RPO≤24h/RTO≤4h를 평가합니다.
5. **재개:** 오류 원인과 권한 경계 확인 후 실제 readiness·로그인·본인 기록·새 메시지/지원·승인/마감·메일 상태를 검증합니다. 계정 해제는 별도 사유/audit를 남기며 기존 공고를 자동 공개하지 않습니다. 필요한 정책/개인정보 안내는 실제 support와 검토된 내용으로 대표가 승인합니다. 복구 결과, 남은 데이터 손실/불명 범위, 영향 대상과 다음 조치를 기록합니다.

복원 실패 시에는 시도마다 다른 mode600 protected diagnostic을 쓰고 UTC/대상/실패 단계/exit와 sanitized 분류를 확정한 뒤 승인된 기간에 폐기합니다. 다음 시도가 앞선 파일을 덮어쓰면 안 됩니다. D2 attempt5의 소실 DNS 원문은 되살아난 것이 아니며 [기존 증거 경계](../launch-evidence/production-release.md#남은-리뷰-항목과-처리-상태)를 유지합니다.

## 1–7일: 매일 두 차례 운영

대표가 정한 오전/오후 PT에 열린 신고·pending jobs·company verification·employer access·실패 알림을 오래된 순서로 확인합니다. 목록은20개씩 다음 페이지까지 확인합니다. MFA 관리자로 조치하고 [moderation](moderation.md)의 실제 회사/담당자 확인, CA 장소·pay 단위/범위·일정·직무상 언어 요건을 검토합니다. 지역/업종별 임금은 당시 공식 자료를 확인하며 국적 제한으로 바꾸지 않습니다. B2의 null expiry/게시일 불명 legacy는 별도 목록에 유지하고 승인일을 임의 backfill하지 않습니다.

10분 이상 backlog, failed/uncertain delivery, suppression 추이를 확인합니다. suppression은 현재 관리자 카드에 표시되지 않으므로 검증된 대상의 보호된 operator read connection에서 `notification_outbox.status='suppressed'`, `profiles.suppressed_email`, `email_webhook_receipts`와 provider 결과를 필요한 범위에서 확인하고 수량/사건 reference만 기록합니다. 통상 첫 응답 **1영업일 이내**는 운영 목표이며 해결 보장이 아닙니다. 부재 시 대체 담당자에게 사건/큐를 인계하고 담당자가 없으면 신규 승인/확대를 보류합니다. [개인정보 절차](privacy-requests.md)는 실제 접수·본인 확인·보존/hold·공유관계 검사 후 실행합니다. 단순 Auth 삭제나 보호 export 자동 발송은 제공하지 않습니다.

허락받은 구직자5명의 가입→검색→지원 과정을 관찰합니다. 신원/비자서류를 수집하지 않고 막힌 단계, 급여/일정/지역 이해와 답장 대기를 기록합니다. 허락 없이 커뮤니티 공고를 복제하거나 메시지를 보내지 않습니다. 현재 인터뷰/영업은 NOT RUN입니다.

## 8–14일: 공급과 첫 답장 확인

`/admin/analytics`의 active+AAL2 전용 집계를 같은 referenceDate로 비교합니다. 정의를 바꾸지 않고 분모/분자/관찰일을 기록합니다([정확한 C4 정의](../OPERATIONAL_HEALTH.md#ca-publication-signals-c4)).

| 지표 | 실제 population / 해석 |
|---|---|
| cohortCount | CA의 최신 실제 posted_at이 `[referenceDate−28일, referenceDate−7일]`인 공고. 마감/만료/중지 이력 포함, owner status로 제외하지 않음. 불명 posted_at 제외, 재게시 최신 시각 기준 |
| appliedWithin7Days / cohortCount | 게시~게시+7일 inclusive에 지원이1개 이상인 cohort 공고. 현재 withdrawn·현재 정지된 지원자 제외. cohort0은 관찰 가능한 공고 없음이며0%가 아님 |
| medianFirstEmployerReplyHours | 같은 eligible 지원 중 현 회사 소유자가 지원 이후~referenceDate에 보낸 첫 메시지까지 시간; 답장한 표본만 중앙값. 답장 표본0은 null이며0시간이 아님 |
| unansweredApplicationCount | 같은 eligible 지원에 qualifying 소유자 답장이 없는 수; seeker/admin/비소유자 메시지는 답장으로 세지 않음 |

초기 가설은 관찰 가능한 공고의 유효 지원 발생 비율50% 이상, 첫 답장 중앙값24시간 이내입니다. 표본이 작으면 실제 수량과 사례를 함께 봅니다. 방문 전환율·유지율·취업자격·완료 채용 수가 아니며 `offered`도 채용 완료가 아닙니다.

대표가 허락받은 연락 경로로 답장 없는 고용주를 확인하고 모집 여부·제목·급여·일정을 명확히 합니다. 공고 수정은 재심사로 비공개 전환될 수 있음을 안내합니다. 모집 종료 시 마감하고 지원/대화를 보존합니다. 링크/메일 장애는 [배포 smoke](../launch-evidence/production-release.md)와 provider 설정을 확인합니다.

## 15–30일: 지속 운영과 다음 결정

고용주5명·구직자5명을 동의받아 인터뷰하고 반복 모집 의향, 실제 면접/채용은 수동 확인 근거와 별도로 기록합니다. 재게시 업체 수는 현 집계에 없는 수동 지표입니다. 원시 지원/메시지를 외부 분석으로 보내지 않습니다. 지역별 공급, 급여·시간 조건, 답장 지연, 가입 장벽을 먼저 개선하고 낮은 수치만으로 유료 광고·AI·전국 확대·새 앱을 자동 추가하지 않습니다.

매주 queue/신고 누락, 비용, 권한/보안 사건, support/privacy hold, backup 성공·최신 복구점과 rollback 자산의 현재 policy 호환을 점검합니다. 공고10,000개 경계 전 page500 문제를 해결하고 sitemap50,000 URL 전에 분할을 계획합니다. [stream/RPC 등 residual](../launch-evidence/production-release.md#남은-리뷰-항목과-처리-상태)의 실제 발생 신호·담당·다음 판단을 유지합니다.

30일째 대표가 cohort와 응답 표본, 공급/재게시, 신고·support 첫 응답, privacy 미완료 범위, 장애/복구/비용, 사용자 관찰을 검토합니다. 유지/개선/공개 확대 보류의 근거·담당·기한을 남깁니다. 현재 이 결과는 모두 **NOT RUN**입니다.
