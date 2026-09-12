# K-Work US 저장소 점검

2026-09-09 / 기준 c8de0c8 / 대상: /Users/rinny/IdeaProjects/AlbaMon

## 판단

**핵심 채용 흐름은 구현되어 있지만 현재 상태로 무료 공개 출시하기에는 차단 요소가 남아 있다.** 테스트 수나 문서의 완료 표시만으로 실제 서비스 준비가 끝났다고 볼 수 없다.

117개 src 파일, page/route 파일 30개, migration 10개, 테스트 파일 46개를 가진 Next.js 단일 앱이다. 주요 route·DB helper·migration·권한·설정·CI·배포 문서와 17페이지 원본 PDF를 검토했다. 모든 사용자 경로를 실제 인증으로 실행한 감사는 아니다.

검토 중 사용자의 최종 결정은 **CA 전체 우선, 무료 공개 서비스, 대표 1명+Codex**였다. 전국 출시는 현재 범위에서 제외했다.

## 1. 기능 지도

| 영역 | 실제 구현 | 현재 한계 | 주요 근거 |
|---|---|---|---|
| 공개 홈 | 제품 소개, 구직/고용주 진입, 모바일 하단 메뉴 | LA/OC 베타 문구, 로그인 상태와 무관한 공용 로그인 CTA | src/app/(public)/page.tsx, src/components/SiteHeader.tsx |
| 공고 검색 | GET 기반 검색어·도시·업종·고용형태·언어요건·급여·정렬, DB public view | 도시 9개 고정, 급여 단위 혼합, 페이지 없음 | src/components/JobFilters.tsx:66, src/lib/db/jobs.ts |
| 공고 상세 | 급여·위치·일정·업무·요건·복지·언어·회사 인증 안내 | expires_at 미사용, build mock 경로 재현 | src/app/(public)/jobs/[id]/page.tsx:39 |
| 로그인/가입 | Google/Kakao/Naver registry, OAuth callback, Phone OTP 폼 | 설정 flag가 실제 provider 성공을 뜻하지 않음; Naver 연결 미검증; 이메일/비밀번호 폼 없음 | src/lib/auth/providers.ts, social.ts, phone.ts |
| 역할/권한 | seeker/employer/admin; profiles.role 사용; 서버 guards; RLS | 실제 역할별 hosted DB 검증 증거 없음; 한 계정 단일 역할 | src/lib/auth/session.ts, access.ts, guards.ts |
| 고용주 전환 | 신청 폼, pending 제한, 관리자 승인과 역할 승격을 RPC transaction으로 처리 | 승인 알림 없음, 회사가 자동 생성되는 것은 아님 | src/lib/db/employer-access-requests.ts, 20260706000000 migration |
| 회사 | 생성/수정, 자기 회사 소유권, 검증 flag 관리자 제한 | 연락처/사업장 실제 확인은 사람의 업무 | src/lib/db/companies.ts |
| 공고 등록 | 필수 입력, 5가지 급여 단위, 위험 문구 검사, pending 제출 | 지역 최저임금 판단 없음; 약관 확인을 DB에 보관하지 않음; 수정/마감 UI 없음 | src/lib/employer/validation.ts, src/lib/db/employer-jobs.ts |
| 관리자 심사 | pending 승인/반려, 회사 검증 | 승인 후 공고 중지·반려 사유 전달·계정 제재 경로 없음 | src/lib/db/admin-moderation.ts:268 |
| 지원 | 로그인 seeker 지원, 1,000자 소개, 중복 지원 DB 차단 | 이름/프로필 입력 없음, 이력서 없음 | src/app/(public)/jobs/[id]/apply/, src/lib/db/applications.ts |
| 지원 관리 | 구직자 본인 이력, 고용주 본인 공고 지원자, 6개 상태 | 고용주가 withdrawn도 설정 가능; 구직자 철회 없음; 역할 승격 뒤 과거 구직 경로 제약 | 20260624000000/20260627000000 migrations |
| 메시지 | 지원 건별 텍스트 대화, 2,000자 제한, 참여자 접근 통제 | 실시간 수신/읽음 표시/페이지 없음; 타임존 표시 확인 필요 | src/lib/db/messages.ts, MessageThread.tsx |
| 신고 | 6개 사유, 로그인 신고, 중복 제한, 관리자 reviewed/dismissed | 신고 처리 완료와 실제 게시 중지는 연결되지 않음 | src/lib/db/reports.ts, src/app/admin/reports |
| 알림 | 개발용 이벤트 로그 함수 | production에서는 skipped. env만 넣어도 발송되지 않음 | src/lib/notifications/dev.ts:30 |
| 운영 대시보드 | 여러 대기열 수량, health 상태, 최근 audit 읽기 | audit writer 없음; 관측 상태가 기능 가동 여부와 다를 수 있음 | src/app/admin/page.tsx, src/lib/db/audit-logs.ts |
| 분석 | 공고/회사/지원/신고/메시지 집계 | 방문→지원 전환, 응답 시간, 실제 채용은 측정하지 않음 | src/lib/db/admin-analytics.ts |
| 정책 | 약관·프라이버시·공고정책·근무자격 route 존재 | 네 페이지 모두 ComingSoon. 공개용 정책이 아님 | src/app/(public)/terms, privacy, posting-policy, work-authorization-info |
| SEO/a11y | metadata, canonical, robots, 정적 sitemap, form label/focus | 개별 공고 sitemap/JobPosting JSON-LD 없음; 완전한 영어 번역/언어전환 기능 아님 | src/app/sitemap.ts, src/app/layout.tsx, tests/seo.test.ts |
| 결제 | 없음 | Stripe는 Slice 23에서 제거. boost DB 잔재는 의도적으로 미사용 | package.json, README |
| 운영 기반 | Vercel/Supabase runbook, GitHub CI, offline 문서 검사 | 실제 deployment·도메인·백업·알림 provider가 검증된 것은 아님 | .github/workflows/ci.yml, docs/DEPLOYMENT.md |

## 2. 실행해서 확인한 결과

| 검사 | 결과 | 의미/한계 |
|---|---|---|
| npm test | 46 files, 495 tests PASS | 상당수는 mock 기반 helper/렌더링/SQL 텍스트 검사 |
| npm run lint | PASS | ESLint 오류 없음 |
| npm run typecheck | PASS | 현재 코드 타입 검사 성공 |
| npm run verify:beta | 6/6 PASS | offline 문서 검사. 실제 베타 가동 검사가 아님 |
| npm run verify:local-supabase | 7/7 PASS | offline 입력/문서 검사. DB 접속 검사가 아님 |
| npm run build | PASS, Next 16.2.9 | Supabase를 placeholder로 덮어쓴 CI 유사 빌드. live DB 배포 보증 아님 |
| npm audit --omit=dev --json | 총 5개: Critical 1 / High 3 / Moderate 1 | 패키지 단위 집계. 각 경고의 실제 도달 가능성은 별도 |
| docker info | daemon 연결 실패 | 실제 로컬 Postgres/RLS/OAuth 통합 검증은 수행하지 못함 |
| 운영 모드 HTTP smoke | 아래 재현 결과 | 이 감사에서 가장 중요한 테스트 밖 결함 |

Node v22.23.1, npm 10.9.8. Supabase CLI/Docker 실행 파일은 있으나 Docker daemon이 가동되지 않았다. 가동 중인 기존 DB를 초기화하거나 원격 migration을 실행하지 않았다.

.env.local의 값은 출력/문서화하지 않고 설정 여부만 확인했다. Supabase 값과 Google/Kakao/Phone flag는 존재하지만, 이 사실은 hosted schema 적용이나 실제 OAuth/SMS 성공을 입증하지 않는다. 기존 미추적 .idea/는 작업 전부터 있었고 수정하지 않았다.

### 재현 F01: 미설정 운영 빌드의 샘플 상세 공고 노출

~~~bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false \
NEXT_PUBLIC_AUTH_KAKAO_ENABLED=false \
NEXT_PUBLIC_AUTH_PHONE_ENABLED=false \
NEXT_TELEMETRY_DISABLED=1 npm run build
~~~

이후 같은 placeholder 환경으로 npm run start -- --hostname 127.0.0.1 --port 3100을 실행했다.

| HTTP 요청 | 관찰 |
|---|---|
| GET /api/health | 200 |
| GET / | 200 |
| GET /jobs | 500 |
| GET /jobs/kw-001 | **200, x-nextjs-cache: HIT**, 제목에 샘플 회사 “강남 키친” |
| GET /privacy | 200, Coming soon |
| GET /jobs/not-a-uuid | 500, 미설정 환경 |

원인: src/lib/db/jobs.ts:44의 NEXT_PHASE 빌드 예외가 mock fallback을 허용하고, src/app/(public)/jobs/[id]/page.tsx:39의 generateStaticParams가 이 데이터를 정적 HTML로 만든다. 런타임의 fail-closed 함수가 실행되기 전에 캐시된 상세 페이지가 응답한다.

**미설정/실패 빌드에 대한 재현이다. 현재 외부 운영 사이트가 실제로 샘플 데이터를 노출하고 있다고 주장하는 것은 아니다.** 유효한 hosted credentials로 같은 현상이 발생하는지는 이번 감사에서 확인하지 않았다.

수정/회귀 검증은 실행 계획 A2에 연결했다. 데이터 helper 단위 테스트 외에 실제 build→start→HTTP 응답 검사가 필요하다.

## 3. 우선순위별 발견사항

P0는 공개 전 해결/검증, P1은 운영 리허설 전 해결, P2는 출시 후 확장이다.

| ID | 우선순위 | 발견 | 근거/상태 | 연결 작업 |
|---|---|---|---|---|
| F01 | P0 | mock 정적 상세가 운영 모드에서 노출 | HTTP로 재현 | A2 |
| F02 | P0 | Next.js와 transitive 의존성 보안 경고 | npm audit: next critical, postcss/sharp/nanoid high, baseline-browser-mapping moderate | A1 |
| F03 | P0 | 실제 인증·RLS·migration 통합 검증 공백 | CI는 live Supabase 없이 실행, Docker daemon 미가동 | A3/A4, D2 |
| F04 | P0 | 정책 4개와 개인정보 처리 경로 미완성 | 실제 페이지 ComingSoon, 삭제 route/절차 없음 | C3 |
| F05 | P0 | 신고 이후 공고 내리기/계정 정지 불가 | 관리자 공고 mutation은 pending 전용 | B2/C2 |
| F06 | P0 | expires_at이 공개·지원 조건에 사용되지 않음 | schema에는 존재, view와 public helper는 approved만 검사 | B2 |
| F07 | P0 | 실제 이메일 없음 | production notification skipped | C1 |
| F08 | P1 | 도시 목록은 LA/OC, CA 외 입력도 가능 | LAUNCH_CITIES, state 정규식은 두 글자만 검사 | B1 |
| F09 | P1 | 시급·연봉을 같은 숫자로 정렬, 급여 하한에 pay_max 사용 | searchApprovedJobs/filterAndSortMockJobs | B1 |
| F10 | P1 | 이름 없는 프로필, phone 가입이면 이메일도 없을 수 있음 | handle_new_user는 id/email만 삽입; 프로필 작성 UI 없음 | A4 |
| F11 | P1 | 고용주 withdrawn, 구직자 철회 없음, 역할 승격 후 과거 접근 제약 | 상태 enum/RPC/guard의 현재 동작 | B3 |
| F12 | P1 | proxy 갱신 쿠키를 response에만 기록 | src/lib/supabase/proxy.ts:24; 같은 요청의 stale token 위험, live 재현 미수행 | A4 |
| F13 | P1 | health가 DB 장애·알림 미구현을 구별하지 못함 | 항상 200, env presence만 검사; email key만으로 configured | A2/C1 |
| F14 | P1 | audit_logs 조회만 있고 조치 기록 writer 없음 | admin 최근활동이 실제 감사 추적이 아님 | B2/C2 |
| F15 | P1 | 공개/지원/메시지/관리자 목록에 명시적 페이지 제한 없음 | helper의 무제한 select; PostgREST 기본 상한에 의한 누락 위험 | B1/B3/C2 |
| F16 | P1 | 접근 횟수·자동화 악용 제한 미흡 | 메시지 길이와 중복 제한은 있으나 계정별 횟수 제한 없음 | C2 |
| F17 | P1 | 배포 실패·복구·사업 운영의 실증 없음 | runbook 존재와 수행 증거는 다름 | D1~D3 |
| F18 | P2 | 실시간 채팅·이력서·즐겨찾기·AI·결제 없음 | 계획된 제외/후속 개선 | 공개 출시에 추가하지 않음 |

권한 설계의 좋은 기반: profiles.role을 권위 있는 값으로 사용하고, owner RLS가 현재 역할을 재검사하며, company verification/boost/지원서 본문 변경을 trigger로 보호한다. 이를 새 인증 구조로 전면 교체할 필요는 없다.

주의할 데이터 경계: public_job_listings view만 살피지 말고 anon/authenticated의 jobs/companies 직접 REST 접근도 검사해야 한다. 현재 base-table grants와 public RLS는 approved job 또는 verified company의 전체 허용 컬럼을 공개할 수 있다. 회사 전화번호·owner_id 등 공개 범위를 정책과 실제 응답 기준으로 확정한다.

## 4. 현재 정보로 확인한 외부 근거

아래는 출시 계획 수립에 필요한 공식 자료만 사용했다. 점검 기준일은 2026-09-09이고 실제 변경 작업 때 다시 확인한다.

- [Next.js Server Actions DoS advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj): 현재 16.2.9가 영향 버전 범위에 포함된다. 이 저장소는 App Router와 Server Actions를 사용하므로 우선 확인 대상이다.
- [Next.js AVIF Image Optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4): 수정 버전은 16.3.3. npm audit은 현재 업데이트 대상으로 16.3.4를 제시했다. 여기서 모든 critical 조건이 현재 앱에서 악용된다는 의미는 아니다.
- [Supabase SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client): request/response 쿠키 갱신 및 인증 검증 기준.
- [EEOC national-origin guidance](https://www.eeoc.gov/national-origin-discrimination): 민족/출신국가/특정 비자 선호 공고와 직무 중심 서비스 설계를 구분해야 한다.
- [California Equal Pay Act FAQ](https://www.dir.ca.gov/dlse/california_equal_pay_act.htm): 해당 고용주가 제3자를 통해 게시하는 공고의 pay scale 의무를 포함한다.
- [California minimum wage](https://dir.ca.gov/dlse/minimum_wage.htm): 2026년 주 기본 시급은 $16.90이고 일부 도시/카운티·업종은 더 높다. 이 값 하나로 모든 공고를 합법이라고 판단할 수 없다.
- [California AG privacy-policy guidance](https://www.oag.ca.gov/news/press-releases/attorney-general-kamala-d-harris-issues-guide-privacy-policies-and-do-not-track): 개인정보를 수집하는 상업 웹사이트의 개인정보처리방침 게시와 설명 요구를 참고한다. CCPA 적용 여부는 별도 검토이며 소규모라는 이유로 privacy page를 생략하지 않는다.

## 5. 실행 전 남은 확인

현재 hosted deployment 유무, 도메인 소유, Google/Kakao 실제 설정, 운영 DB migration 적용 상태, 실제 계정/공고 수, 백업 구성, branch protection은 확인되지 않았다. 초기 실행 작업에서 read-only로 확인하고 staging을 준비한다. 계정 값이 파일에 있다는 이유만으로 “설정 완료” 처리하지 않는다.

UI는 소스와 서버 렌더링 검사까지 확인했다. 실제 모바일 브라우저·보조기술·화면 배치의 완전한 QA, OAuth 성공과 메시지 송수신, 실제 RLS 차단은 실행 계획의 검증 작업으로 남아 있다.
