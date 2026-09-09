# California Free Public Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대표 1명과 Codex가 기존 K-Work US를 캘리포니아 한인 커뮤니티를 위한 무료 공개 구인·구직 서비스로 출시한다.

**Architecture:** Next.js + Supabase를 유지하고 Vercel에 배포한다. 공개 구직 탐색, 심사를 거친 고용주/공고, 지원·대화·모집 마감의 핵심 흐름에 보안·정책·실제 알림·복구를 보완한다. 전국 확장과 결제는 넣지 않는다.

**Tech Stack:** Next.js 16/React 19/TypeScript/Tailwind, Supabase Auth/Postgres/RLS, Vercel, Resend, Vitest, pgTAP, Playwright.

**Spec:** [확정 방향과 출시 설계](../specs/2026-09-09-california-launch-design.md).

## Global Constraints

- 첫 출시의 공개 공고는 캘리포니아 근무지(state = CA)만 허용한다.
- 구직자와 고용주 모두 무료로 이용하며 결제·부스트를 추가하지 않는다.
- 제품명은 K-Work US를 유지한다.
- 한국어 중심 UI와 주요 안내의 영어 병기를 유지한다.
- 커뮤니티 특화와 직무상 한국어 능력 요건을 지원하며 국적·민족에 따른 지원 제한을 만들지 않는다.
- Next.js App Router, TypeScript, Tailwind, Supabase Auth/Postgres/RLS를 유지한다.
- 사용자 데이터 접근은 검증된 세션과 DB 권한으로 제한하며 사용자 입력의 role을 신뢰하지 않는다.
- 운영 빌드와 운영 런타임에서 샘플 공고를 공개하지 않는다.
- 사용자 흐름에서 service-role 키를 사용하지 않는다. 알림 worker와 통제된 운영 작업에만 사용한다.
- 운영 DB에서 reset 또는 seed를 실행하지 않으며 기존 migration을 수정하지 않는다.
- 실제 공개 전 RLS 통합 테스트, 주요 브라우저 흐름, 정책 게시, 복구 리허설을 통과한다.
- 자동 결제, 전국 확장, AI 매칭, 이력서 파일 업로드, 실시간 채팅은 첫 출시 범위에서 제외한다.

---

## 1. 결론과 읽는 순서

**새로 만들 필요는 없다. 핵심 채용 기능은 있고, 공개 운영에 필요한 연결과 검증이 부족하다.** 현재 코드가 “실제 배포 가능”하다는 판정은 아니다.

이번에 직접 확인한 결과는 46개 테스트 파일/495개 테스트, lint, typecheck, CI와 유사한 build 통과다. 반면 **미설정 production build/start에서 샘플 상세 공고가 200으로 노출되는 결함을 재현했고**, 의존성 audit에서 Critical 1/High 3/Moderate 1을 확인했다. 실제 DB와 provider E2E는 아직 검증되지 않았다.

| 문서 | 용도 |
|---|---|
| [저장소 점검 보고서](../audits/2026-09-09-repository-audit.md) | 현재 기능, 코드 근거, 실제 검증과 미검증 구분 |
| [출시 설계](../specs/2026-09-09-california-launch-design.md) | CA/무료/1인 운영 기준, 상태·권한·데이터 계약 |
| [A. 보안·인증·검증 기반](2026-09-09-launch-foundation.md) | 첫 개발 작업. A1~A4 |
| [B. CA 채용 흐름](2026-09-09-ca-marketplace.md) | 지역 검색, 급여, 공고 수정/마감, 지원 철회. B1~B3 |
| [C. 운영 완성](2026-09-09-launch-operations.md) | 실제 알림, 신고/제재, 정책, 모바일/SEO/지표. C1~C4 |
| 이 문서 D1~D3 | 실제 환경·배포 순서·출시 리허설·공개 결정 |

문서의 계획 코드는 다음 실행자가 변경 위치와 검증 방법을 알기 위한 구현 지침이다. 현재 저장소에 해당 기능이 구현됐다는 뜻이 아니다. 설계와 실행 범위를 검토한 뒤 A1부터 진행한다.

## 2. 출시할 제품

**이용 대상:** CA에서 사람을 구하는 한인 사업자와 한국어가 편하거나 한국어 능력을 활용하려는 구직자. 고용 형태는 현재 part-time/full-time/temporary/contract를 유지한다.

**사용 흐름:** 누구나 공고 탐색→Google 로그인→간단 프로필→지원→메시지→면접/오퍼 상태 확인. 고용주는 권한 신청→회사 등록→공고 심사→지원자 관리→모집 마감. 대표는 고용주/공고 심사와 신고 처리.

한인 커뮤니티를 고객층으로 삼는 것과 특정 민족만 지원 가능하게 만드는 것은 구분한다. “고객 응대를 위한 한국어 능력”처럼 직무 요건으로 설계한다. [EEOC 공식 안내](https://www.eeoc.gov/national-origin-discrimination)

| 첫 출시 필수 | 뒤로 미룰 항목 |
|---|---|
| CA 도시 검색, 같은 급여 단위 비교, 페이지 | 전국 검색·타주 법규 |
| 실제 로그인·이름·검증된 연락처 | Naver, Phone OTP, 계정 다중 역할 |
| 공고 편집·재심사·마감·자동 만료 조건 | 지도/반경 검색, 근무일 정밀 필터 |
| 지원·기존 메시지·본인 철회 | 이력서 업로드, AI 매칭, 실시간 채팅 |
| 신고 후 중지·정지·이력·악용 방지 | 외부 사업자 자동 인증, 대규모 CS 시스템 |
| 이메일·정책·삭제 요청 절차·복구 | 결제/유료 부스트, 네이티브 앱 |

완전한 영어 번역 사이트를 새로 만드는 작업은 포함하지 않는다. 한국어 중심 UX와 중요한 영어 병기를 정리한다.

## 3. 일정과 작업량

**권장 일정: 6~8주.** 대표가 주당 약 25시간을 이 프로젝트에 투입하고 Codex의 변경을 검토·검증한다는 가정이다. 코딩 시간만이 아니라 외부 로그인 설정, 정책 검토, 화면 확인과 배포 리허설이 필요하다. 법률 검토·도메인/provider 승인 대기는 별도이며 날짜를 보장하지 않는다.

| 순서 | Codex 작업 | 예상 기술 작업량 | 대표가 병행할 일 | 통과 결과 |
|---|---|---:|---|---|
| 1주차 | A1 보안 패치, A2 mock 차단, A3 DB 검증 시작 | 20~30시간 | 실제 계정/DB/도메인 현황 확인, 정책 검토 의뢰 | 가짜 운영 데이터 차단, DB suite 실행 |
| 2주차 | A3 마무리, A4 인증/MFA, B1 CA 검색 | 20~30시간 | Google 실제 로그인, 5곳 사업자 인터뷰 | 로그인과 CA 검색 완주 |
| 3주차 | B2 공고 수명주기, B3 지원/대화 | 18~28시간 | 반려·마감·신고 처리 리허설, 초기 공고 확보 | 승인부터 마감까지 연결 |
| 4주차 | C1 알림, C2 제재/한도 | 24~34시간 | 도메인 발송 확인, 운영 문구/검토 기준 확정 | 앱 밖 알림과 실제 제재 가능 |
| 5주차 | C3 정책, C4 모바일/SEO, D1/D2 staging 검증 | 18~30시간 | 정책 최종 확인, iPhone 실사용, 복구 훈련 | 공개 체크리스트 증거 확보 |
| 6주차 | D3 공개와 첫 주 오류 수정 | 10~16시간 | 공고·구직자 유입, 하루 2회 운영 | 무료 공개 서비스 운영 시작 |
| 7~8주차 | 장애/승인 대기/검토 지연 버퍼 | 필요 시 | 지연 원인 해소 | 미완료 차단 항목을 무리하게 생략하지 않음 |

세부 A~D 추정 합계는 약 **110~160시간**이다. 대표의 공고 공급 확보·정책 협의·고객 대응은 추가 약 20~30시간을 예상한다. 이는 코드와 현재 빈틈에 근거한 계획 추정이지 확정 견적이 아니다. 주당 10시간이면 같은 범위가 약 3~4개월로 늘어날 수 있다.

가장 중요한 경로는 A1→A2→A3→A4→B2/B3→C1/C2/C3→D2→D3이다. 디자인 전면 개편이나 신규 앱 개발을 이 경로에 넣지 않는다.

## 4. 대표와 Codex의 책임

| 대표가 결정/수행 | Codex가 준비/수행 |
|---|---|
| 브랜드/운영 주체/도메인/예산 결정 | 기존 코드 유지, 필요한 변경과 회귀 검사 |
| provider 콘솔·실제 계정 로그인·MFA 보관 | callback/env 체크리스트, migration/권한 검사 |
| 법률·개인정보 정책 사실 확인과 외부 검토 | 정책 초안 구조, 데이터 흐름/삭제 영향 문서 |
| 공고 사실 확인, 업체와 소통, 반려/중지 판단 | 관리자 화면·이력·한도·알림 |
| 데이터 삭제/실제 고객 통지/공개 배포 결정 | 대상·영향·실행 결과를 검토할 수 있게 준비 |
| 사용자 인터뷰와 실제 채용 결과 확인 | 관측 가능한 지원/메시지 지표 집계 |

작업 관리 도구를 새로 도입하지 않아도 된다. 이 문서의 checkbox와 한 작업당 PR/커밋, docs/launch-evidence의 결과로 시작한다. API 키·개인정보·인증 코드·복구 코드는 문서/채팅/커밋에 넣지 않는다.

## 5. 예상 월 운영비

무료는 이용자 과금이 없다는 뜻이다. 서버·발송·운영 비용은 대표가 부담한다. 아래는 2026-09-09 공식 가격 확인 기준이며 초과 사용량·세금·외부 검토/Codex 사용료는 제외한다.

| 항목 | 계획 예산 | 설명 |
|---|---:|---|
| Vercel Pro, 대표 1명 | $20/월부터 | 상업적 서비스 운영 기준. Hobby는 비상업적 개인 용도로 제한된다. [가격](https://vercel.com/pricing), [Hobby 조건](https://vercel.com/docs/plans/hobby) |
| Supabase Pro | 약 $35/월부터 | $25 plan + 두 Micro 프로젝트 $20 - compute credit $10 기준. staging/production 분리. [공식 계산기](https://supabase.com/pricing) |
| Resend | $0~20/월부터 | Free는 월 3,000·하루 100통, Pro는 $20/월·50,000통 기준. [공식 가격](https://resend.com/pricing) |
| uptime/오류 관측 | $0~15/월 예산 | 초기 내장 로그+외부 HTTP 모니터로 시작. 유료 도구 계약은 별도 결정 |
| 도메인/지원 메일함 | 별도 실제 견적 | 원하는 도메인의 가격과 기존 메일함 유무 확인 |

**초기 인프라 예산은 대략 월 $55~90, 운영 한도는 $100~150로 잡는 안**을 추천한다. 비용 알림은 설정 예산의 50%/80%/100%에서 확인한다. email 발송량 80통/일에 가까워지면 무료 발송 일일 제한으로 사용자 알림이 밀리기 전에 Pro 전환 또는 발송량 조정을 결정한다.

무료 tier만 사용해 공개 서비스를 유지하는 것을 출시 성공 조건으로 삼지 않는다. 공급 확보 광고와 법률 검토는 이 인프라 예산에 포함되지 않는다.

## 6. 필요한 운영 입력

계획 작성은 완료 가능하지만 아래 실제 값을 알지 못한 채 production 설정을 만들면 안 된다. D1에서 대표가 확인한다.

| 입력 | 필요한 시점 | 기록 장소 |
|---|---|---|
| 운영 주체 이름/주소/지원 연락처 | C3 | 검토된 정책, 공개 가능한 정보만 |
| 실제 서비스 도메인 | A4/D1 | Vercel/DNS/Supabase 설정 |
| staging/production Supabase project 식별자 | D1 | 운영 계정 관리, 비밀 저장소 |
| 실제 DB에 있는 사용자·공고·migration 상태 | B2/D1 | 개수·상태 중심 증거 |
| Google OAuth 콘솔/이메일 도메인 접근 | A4/C1 | provider 콘솔 |
| 백업 보관 설정과 복구 권한 | D2 | 복구 runbook |
| 개인정보 보관/삭제·연령·정책 효력 결정 | C3 | 외부 검토 기록 |

### Task D1: 환경 분리와 staging 배포

**예상:** 4~6시간. **선행:** A 기반. 신규 migration이 추가될 때 staging에 반복 적용한다.

**Files:** Modify docs/DEPLOYMENT.md, docs/PRODUCTION_ENV_VARS.md, docs/LAUNCH_CHECKLIST.md, README.md, docs/PRODUCT_BRIEF.md. Create docs/launch-evidence/environments.md.

**Interfaces:** Vercel Preview는 staging Supabase, Production은 production Supabase. Vercel Build Command는 npm run build:release. 환경별 origin은 HTTPS이며 OAuth callback은 정확한 /auth/callback이다.

- [ ] **D1.1 기존 호스팅과 DB를 읽기 전용으로 확인한다.** 현재 운영 중인 DB가 있는지, migration 10개가 적용됐는지, 실사용 행이 있는지 확인한다. 새 project를 만들기 전에 기존 것을 재사용할 수 있는지 판단한다.
- [ ] **D1.2 staging을 연결하고 변경 계획만 확인한다.** STAGING_PROJECT_REF는 콘솔에서 확인한 실제 값이고 셸 환경에 둔다.

~~~bash
test -n "$STAGING_PROJECT_REF"
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase migration list --linked
supabase db push --dry-run
~~~

- [ ] **D1.3 대상 project가 staging임을 확인한 뒤 migration을 적용한다.**

~~~bash
supabase db push
~~~

--include-seed를 사용하지 않는다. production 데이터를 staging에 복사하지 않는다. staging fixture는 대표가 통제하는 테스트 계정·가상 공고로만 만든다.

- [ ] **D1.4 Vercel Preview env와 Supabase Auth를 맞춘다.** Google OAuth 승인 origin, Supabase Site URL/redirect allowlist, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true를 설정한다. 다른 provider는 검증 전 false이다. staging의 canonical/noindex와 배포 보호를 확인한다.
- [ ] **D1.5 첫 관리자와 MFA를 구성한다.** 실제 로그인으로 seeker profile 생성→대표가 해당 UUID 확인→trusted 운영 경로에서 admin 승격→TOTP 등록→AAL2 심사 성공을 확인한다. 폼이나 user_metadata로 admin을 만드는 경로는 만들지 않는다.
- [ ] **D1.6 환경 증거와 문서를 갱신한다.** docs의 “PDF가 최우선”/LA·OC 비공개 베타/원래 Slice 번호 설명을 이번 설계 링크와 함께 정리한다. 기존 offline 문서 검사가 요구하는 migration 수나 경로가 바뀌면 검사도 실제 구조에 맞춰 갱신한다.

~~~bash
npm run verify:beta
npm run verify:local-supabase
git add -p
git commit -m "docs: align deployment environments with California public launch"
~~~

### Task D2: 전체 검증과 장애·복구 리허설

**예상:** 6~10시간. **선행:** A~C의 필수 기능 완료.

**Files:** Create docs/launch-evidence/release-candidate.md, restore-drill.md. Modify docs/OPERATIONAL_HEALTH.md.

**Interfaces:** 검사 결과는 날짜·commit·환경·명령·결과·증거 링크를 가진다. 비밀번호·토큰·지원서 원문은 증거에 포함하지 않는다.

- [ ] **D2.1 release candidate를 고정하고 자동 검사를 실행한다.**

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm audit --omit=dev --audit-level=high
npm run build:release
~~~

typecheck/build 순서가 생성된 Next 타입에 의존하면 next typegen을 typecheck 전에 명시해 fresh checkout에서도 동일하게 실행되게 한다.

- [ ] **D2.2 실제 provider 브라우저 검사를 수행한다.** 신규 Google 사용자, seeker 2명, employer 2명, admin 1명으로 아래 Go/No-go 표를 검사한다. 자동 fixture login은 Google 검사를 대신하지 않는다.
- [ ] **D2.3 실패를 주입한다.** staging의 잘못된 DB key→ready 503·실제 오류 화면; 이메일 provider 오류→저장 성공·queue 재시도; 만료 쿠키→로그인 복귀; 같은 상태 2회 변경→conflict; 원문 개인정보가 로그에 없는지 확인한다. 운영 secret을 변경해 장애를 만들지 않는다.
- [ ] **D2.4 백업을 별도 폐기 가능한 환경에 복원한다.** 시간 측정, public job 수·profile 수·주요 FK·RLS/권한·로그인 설정을 확인한다. DB 복원과 OAuth/provider/Vercel env 복구가 별도임을 기록한다. 실제 프로젝트의 백업 범위와 Auth 데이터 복원 범위를 확인한다.
- [ ] **D2.5 앱 rollback을 수행한다.** staging을 직전 정상 deployment로 되돌리고 현재 additive schema와 호환되는지 확인한다. DB reset을 rollback으로 사용하지 않는다. 목표 RPO 24시간/RTO 4시간을 측정 결과로 검증한다.
- [ ] **D2.6 미통과 항목을 수정하고 해당 검사를 다시 실행한다.** Docker/브라우저/provider가 없어 실행하지 못한 항목은 미검증으로 남기며 PASS로 쓰지 않는다.

### Task D3: production 배포와 공개 시작

**예상:** 4~6시간 + 첫 주 운영. **선행:** 아래 필수 Go/No-go 전부 통과, 대표의 실제 공개 결정.

**Files:** Create docs/launch-evidence/production-release.md, docs/operations/first-30-days.md.

**Interfaces:** 실제 production project/도메인/배포 commit을 기록한다. 기존 사용자가 있다면 영향/변경 안내가 준비되어 있어야 한다.

- [ ] **D3.1 production 백업/현재 schema를 확인한다.** 배포 담당은 대표다. Codex는 대상·예정 변경·검증 결과를 먼저 제시한다.
- [ ] **D3.2 production 대상 확인 후 additive migration을 적용한다.**

~~~bash
test -n "$PRODUCTION_PROJECT_REF"
supabase link --project-ref "$PRODUCTION_PROJECT_REF"
supabase migration list --linked
supabase db push --dry-run
~~~

dry-run 검토 후에만 supabase db push를 실행한다. reset/seed는 실행하지 않는다.

- [ ] **D3.3 production env로 새 빌드를 배포한다.** staging artifact를 운영 env로 바꿔 재사용하지 않는다. NEXT_PUBLIC 값은 빌드 시 고정되므로 별도 production build가 필요하다. Domain/TLS/redirect/canonical, worker secret, 이메일 origin을 확인한다.
- [ ] **D3.4 공개 직전 smoke를 한다.**

~~~bash
curl --fail --silent --show-error "$PRODUCTION_ORIGIN/api/health"
curl --fail --silent --show-error "$PRODUCTION_ORIGIN/api/ready"
curl --fail --silent --show-error "$PRODUCTION_ORIGIN/jobs"
~~~

실제 계정 로그인·승인·지원·이메일·메시지·공고 마감도 확인한다. 샘플 이름/kw-001/시드 UUID가 공개 응답과 sitemap에 없음을 확인한다.

- [ ] **D3.5 공개한다.** 사용자 가입과 탐색은 누구나 가능하고 무료다. 공고/고용주 심사 조건을 명확히 표시한다. 대표가 승인한 실제 공고만 올린다.
- [ ] **D3.6 첫 24시간 집중 확인한다.** 5xx/ready 실패, 로그인 실패, 메시지 저장, 이메일 backlog, 신고, 비용 급증을 확인한다. 데이터 손상·권한 노출이면 신규 쓰기/해당 기능을 중지하고 정상 버전으로 복귀한다.
- [ ] **D3.7 결과를 기록한다.** 배포 commit·migration·시각·검사 결과·잔여 P2를 남긴다. 모든 계획 파일의 checkbox는 실제로 수행한 항목만 완료 표시한다.

## 7. Go / No-go

| 필수 조건 | 통과 증거 |
|---|---|
| 운영 mock 0건 | 미설정 build/start 회귀 테스트 + production sample URL/본문 확인 |
| 공개 의존성 취약점 대응 | 미처리 High/Critical 0 또는 해당되지 않음을 검증한 근거와 결정 |
| 로그인/역할/관리자 | 실제 Google 성공, MFA, 자기 승격·다른 고용주 접근 차단 |
| CA 검색과 급여 | CA 다른 도시, 시급/연봉 분리, 범위/페이지 검사 |
| 공고 전체 수명주기 | 신규→승인→수정 재심사→마감/만료·지원 차단 |
| 지원과 대화 | 중복 차단, 본인 철회, 타인 차단, 과거 기록 보존 |
| 신고와 정지 | 실제 공고 중지, 계정 쓰기 차단, audit 이력 |
| 알림 | 실제 수신, 오류 재시도/중복/수신거부·bounce 처리 |
| 정책/개인정보 | 실문구 4개, 지원 연락처, 외부 검토, 열람·삭제 리허설 |
| 모바일/접근성 | 390px/1440px, Safari, 키보드, 오류 복구 |
| 운영/복구 | readiness 경보, 백업 복원, 앱 rollback 실측 |
| 실사용 공급 | 대표가 확인한 실제 공고와 응답할 고용주 확보 |

초기 공급 목표는 **최소 10개 사업장·20~30개 실제 공개 공고**다. 시장 통계에 근거한 보장치가 아니라 빈 서비스로 출시하지 않기 위한 운영 목표다. 수량이 부족해도 샘플 공고로 채우지 않는다.

## 8. 첫 30일의 운영과 성장

CA 전체에서 가입/검색/공고 신청을 허용한다. 초기 영업 시간은 대표의 연결망이 있는 곳에 집중할 수 있다. LA/OC, San Diego, Bay Area 중 확보 가능한 2~3개 생활권에서 시작하되 제품 자체를 LA/OC로 제한하지 않는다.

| 기간 | 대표의 업무 | 확인할 지표/기준 |
|---|---|---|
| 공개 전 | 사업장 10곳 이상에 흐름 설명, 직접 등록 보조, 허락받은 공고 수집 | 공고의 실제 모집 여부, 급여·일정·위치, 연락 가능 |
| 1~7일 | 매일 오전/오후 승인·신고·실패 큐 처리, 구직자 5명 사용 관찰 | 가입→지원 막힘, 고용주 첫 답장, 신고 처리 누락 |
| 8~14일 | 응답 없는 고용주 확인, 제목/급여/일정 명확화 | 게시 후 7일 지원 발생 비율, 응답 없는 지원 수 |
| 15~30일 | 고용주 5명·구직자 5명 인터뷰, 반복 채용 의향 확인 | 다시 공고 낸 업체 수, 실제 면접/채용의 수동 확인 |

초기 목표 가설: 7일 경과 공고 중 50% 이상이 유효 지원 1개 이상, 지원에 대한 고용주 첫 응답 중앙값 24시간 이내, 신고·문의 첫 응답 1영업일 이내. 유효 지원은 철회/스팸을 제외한 제품상의 정의이고 합법 취업 가능 판정이 아니다. 모수가 작으면 원시 수량과 사례를 함께 본다.

모집/지원이 안 생기면 유료 광고·AI·앱 개발부터 추가하지 않는다. 지역별 공급 부족, 급여/시간 조건, 고용주의 답장 속도, 가입 장벽부터 확인한다. 다른 커뮤니티 게시물을 무단 복제하거나 허락 없이 메시지를 보내는 것을 실행 계획에 포함하지 않는다.

## 9. 요구사항 추적표

| 설계 요구 | 작업 |
|---|---|
| 기존 스택·무료·CA·1인 운영 | 전체 제약, B1, D1, 첫 30일 |
| 실제 인증·표시 이름·안전한 callback·MFA | A4 |
| build mock 금지·설정 실패·readiness | A2 |
| 의존성·실제 RLS·브라우저 검증 | A1/A3/D2 |
| 정확한 급여·CA 도시·페이지·시각 | B1/B3 |
| 공개 조건·만료·수정/마감·검토 사유 | B2 |
| 지원 철회·승격 후 기록·당사자 대화 | B3 |
| 실제 알림·실패/중복·수신 제어 | C1 |
| 신고 대응·정지·직접 API 한도·감사 | C2 |
| 정책·동의·보관/삭제·법률 검토 | C3 |
| 모바일·오류 복구·SEO·정확한 KPI | C4 |
| 환경·호스팅·백업·rollback·공개 | D1/D2/D3 |

## 10. 실행을 시작할 때

다음 첫 단위는 **A1 보안 업데이트**다. 한 번에 전체 계획을 구현하라는 요청보다 다음처럼 범위를 지정한다.

> CA 출시 설계와 Launch Foundation 계획을 읽고 A1만 실행해 줘. 현재 작업 디렉터리의 변경을 보존하고, 실제 audit 결과를 기준으로 의존성을 업데이트한 뒤 테스트·타입·lint·build를 확인해 줘. 변경과 검증 결과를 검토할 수 있게 제시해 줘.

실행 방식은 작업별 에이전트+검토 또는 현재 작업에서 순차 실행 중 선택할 수 있다. 어느 경우에도 실제 provider 계정 작업·정책 확정·고객 발송·production 공개는 대표가 결정한다. 이 문서 작성 자체로 해당 외부 작업이 실행된 것은 아니다.
