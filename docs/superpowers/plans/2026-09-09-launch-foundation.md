# Launch Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영에 샘플 데이터를 노출하지 않고 실제 인증·DB 권한을 검증할 수 있는 출시 기반을 만든다.

**Architecture:** 기존 Next.js 앱과 Supabase를 유지한다. 빌드와 런타임의 경계를 검증하고, disposable 로컬 DB를 CI에 연결한다. 사용자 인증은 기존 서버 검증에 프로필 완성과 관리자 MFA를 보완한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase SSR/Auth/Postgres, Vitest, Supabase CLI/pgTAP, Playwright.

**Spec:** [CA 출시 설계](../specs/2026-09-09-california-launch-design.md), 특히 4·8·10장.

> 체크 기준(2026-09-11): `[x]`는 해당 substep의 실제 완료 범위다. 소프트웨어와 미수행 hosted/대표 작업이 섞인 substep은 `[ ]`로 두고 바로 아래에 분리 상태를 적었다. [현재 인수인계](../../launch-evidence/production-release.md)가 실제 공개 NO-GO와 남은 증거를 정리한다.

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

## 파일 책임과 실행 규칙

| 파일 | 책임 |
|---|---|
| package.json / package-lock.json | 검증된 버전과 release/test 명령 |
| scripts/check-release-env.mjs | 배포 필수 설정 검증, 값은 출력하지 않음 |
| scripts/check-production-artifact.mjs | build/start 결과에 샘플 HTML이 없는지 검사 |
| src/lib/supabase/config.ts | 개발 fallback과 운영 설정 구분 |
| src/lib/supabase/proxy.ts | 갱신 쿠키 전달 |
| src/app/api/ready/route.ts | DB read readiness |
| supabase/tests/database/ | 진짜 Postgres 역할·권한 검사 |
| tests/e2e/ | 브라우저를 통한 주요 흐름 |
| src/app/dashboard/profile/ | 사용자 표시 이름 완성 |
| src/app/account/security/ | 관리자 TOTP 등록·검증 |

각 작업은 관련 테스트를 실패시키는 재현→최소 수정→동일 테스트 성공→작업 단위 커밋으로 진행한다. 단계 안의 독립된 파일/검사 하나씩 수행하며 큰 작업을 한 번의 에이전트 메시지로 전부 완료시키지 않는다. 문구 변경처럼 논리가 없는 부분은 중복 단위 테스트를 만들지 않는다.

구현 때 먼저 읽을 로컬 가이드: node_modules/next/dist/docs/01-app/02-guides/production-checklist.md, data-security.md, 03-api-reference/03-file-conventions/proxy.md, 03-api-reference/03-file-conventions/error.md. 업데이트 후 설치된 버전의 문서를 다시 읽는다.

### Task A1: 의존성 보안 경고 해소

> 2026-09-11 D3 실제 상태: [A1 보안 증거](../../launch-evidence/security.md), [D2 최종 audit0/lockfile](../../launch-evidence/release-candidate.md). A1의 당시 dev 경고는 D2에서 해소됐으며 과거 기록은 보존한다.

**예상:** 4~6시간. **선행:** 없음. **산출:** 검토 가능한 lockfile 변경.

**Files:** Modify package.json, package-lock.json. 검증 기록은 docs/launch-evidence/security.md에 새로 저장한다.

**Interfaces:** 기존 앱 API는 유지한다. 이후 작업은 동일 lockfile로 npm ci한다.

- [x] **A1.1 현재 실패 기준을 저장한다.**

~~~bash
npm audit --omit=dev --audit-level=high
npm ls next react react-dom @supabase/ssr @supabase/supabase-js
~~~

현재 기대: audit 실패. 전체 5개 영향 패키지 중 Critical 1/High 3. 이 명령의 결과를 통과로 바꾸는 것이 검증이다.

- [x] **A1.2 업데이트 후보와 설치된 Next 문서를 확인한다.**

~~~bash
npm view next@16.3.4 version engines
npm view eslint-config-next@16.3.4 version
~~~

2026-09-09 audit이 제시한 후보는 16.3.4다. 실행 시 더 최근 advisory가 있으면 같은 stable major에서 수정된 버전을 선택하고 선택 이유를 기록한다. Windows 전용/이미지 기능 전용 경고의 도달 가능성과 App Router/Server Actions 경고를 구분한다.

- [x] **A1.3 의존성을 최소 변경한다.**

~~~bash
npm install --save-exact next@16.3.4
npm install --save-dev --save-exact eslint-config-next@16.3.4
npm audit fix --omit=dev --dry-run
~~~

dry-run 결과에서 남은 transitive 패치만 확인한 후 필요한 업데이트를 적용한다. --force는 사용하지 않는다. Next 내부 dependency를 무리한 override로 덮어쓰지 않는다.

- [x] **A1.4 검사하고 기록한다.**

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
~~~

기대: 전체 성공, 미처리 운영 High/Critical 0. 빌드 성공만으로 F01 해결을 선언하지 않는다.

- [x] **A1.5 검증된 의존성 변경만 커밋한다.**

~~~bash
git add package.json package-lock.json docs/launch-evidence/security.md
git commit -m "fix: update vulnerable production dependencies"
~~~

### Task A2: 운영 mock 차단, release gate, readiness

> 2026-09-11 D3 실제 상태: [D2 no-mock artifact/ready fault](../../launch-evidence/release-candidate.md), [D1 실제 실패하는 release gate](../../launch-evidence/environments.md). 실제 hosted 검증은 D단계의 미완료 항목이다.

**예상:** 8~12시간. **선행:** A1. **산출:** 실제 build/start에서도 가짜 공고가 공개되지 않음.

**Files:**
- Modify src/lib/db/jobs.ts, src/lib/supabase/config.ts, src/app/(public)/jobs/[id]/page.tsx, src/proxy.ts, src/lib/ops/health.ts, package.json.
- Create scripts/check-release-env.mjs, scripts/check-production-artifact.mjs, src/app/api/ready/route.ts, tests/production-artifact.test.ts, tests/readiness.test.ts.
- Update tests/db-jobs.test.ts, tests/health.test.ts, docs/DEPLOYMENT.md, docs/PRODUCTION_ENV_VARS.md.

**Interfaces:**
- build:release = node scripts/check-release-env.mjs && next build.
- GET /api/ready → 200 {status:"ok"} 또는 503 {status:"unavailable"}; cache-control:no-store.
- getApprovedJobById(id) → 잘못된 UUID는 undefined; 운영 DB 오류는 오류 처리 경로. 개발 mock ID는 개발에서만 허용.

- [x] **A2.1 HTTP 회귀 검사를 먼저 만든다.** 이 검사는 A1 이후에도 기존 동작이면 실패해야 한다.

~~~js
import assert from "node:assert/strict";
const response = await fetch("http://127.0.0.1:3100/jobs/kw-001");
const html = await response.text();
assert.notEqual(response.status, 200, "sample detail must never be public");
assert.equal(html.includes("강남 키친"), false);
~~~

스크립트는 node:child_process로 자체 build/start를 시작하고 종료한다. 배포 자격 증명은 사용하지 않는다. 읽은 .env.local을 수정하지 말고 child process 환경에서 Supabase placeholder를 명시한다. CI 포트는 3100을 사용하고 서버 준비는 HTTP로 최대 30초 확인한다.

- [x] **A2.2 static mock 생성 경로를 없앤다.**

상세 page에서 generateStaticParams를 제거하고 다음 설정을 사용한다. 보호되지 않은 UUID를 DB query에 넣기 전에 검증한다. getApprovedJobs/getApprovedJobById/searchApprovedJobs의 생산 모드 fallback에서 NEXT_PHASE 예외를 제거한다.

~~~ts
export const dynamic = "force-dynamic";

// src/lib/db/jobs.ts: production에서는 build도 mock을 쓰지 않는다.
function mayFallbackToMockJobs(): boolean {
  return process.env.NODE_ENV !== "production";
}
~~~

개발 fixture 검색은 유지한다. CI의 미설정 build는 공고를 prerender하지 않아 성공할 수 있으나 배포용 build:release는 별도 설정 검사로 반드시 차단한다.

- [x] **A2.3 release 설정 검사 명령을 추가한다.**

~~~js
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), false);
const required = [
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED"
];
for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value || /your-project|your-anon-key|example\.com/.test(value)) {
    throw new Error("Missing release setting: " + name);
  }
}
const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL);
if (origin.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/.test(origin.hostname)) {
  throw new Error("Release requires a public HTTPS origin");
}
if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") {
  throw new Error("Release requires tested Google authentication");
}
~~~

@next/env는 Next 의존성으로 설치된 버전을 확인한다. 직접 import하는 CLI 의존성이므로 package.json에 Next와 같은 버전으로 명시하거나 기존 Next CLI의 환경 로딩 기능을 사용한다. API key의 “존재”와 “유효성”은 구분하고 유효성은 D2에서 확인한다. C1/C3 완료 시 이메일·지원 연락처 등 추가 필수값을 이 검사에 포함한다.

- [x] **A2.4 liveness와 readiness를 구분한다.**

ready는 cookie 없는 Supabase client로 public_job_listings의 id 한 건을 읽는다. AbortSignal.timeout(2000)을 붙이고 오류/설정 누락은 503으로 감싼다. 빈 데이터는 정상이다.

~~~ts
const result = await supabase.from("public_job_listings")
  .select("id").limit(1).abortSignal(AbortSignal.timeout(2_000));
const ok = !result.error;
return Response.json(
  { status: ok ? "ok" : "unavailable" },
  { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
);
~~~

supabase는 이 route에서 기존 공개 URL/anon key로 생성한 cookie 없는 client다. getCurrentUser나 service-role client를 호출하지 않는다. src/proxy.ts에서 health/ready/내부 worker를 제외하고 matcher 테스트로 확인한다.

- [x] **A2.5 정상/장애 시나리오를 검증한다.**

~~~bash
npm test -- tests/production-artifact.test.ts tests/readiness.test.ts tests/db-jobs.test.ts
npm run build
node scripts/check-production-artifact.mjs
~~~

기대: sample URL 404 또는 안전한 오류, 샘플 본문 없음; malformed UUID 404; 미설정 release build 실패; 빈 정상 DB ready 200; timeout/잘못된 key ready 503; health는 DB 장애와 무관한 200.

- [x] **A2.6 커밋한다.**

~~~bash
git add src/lib/db/jobs.ts src/lib/supabase/config.ts src/app src/proxy.ts src/lib/ops/health.ts scripts package.json package-lock.json tests docs/DEPLOYMENT.md docs/PRODUCTION_ENV_VARS.md
git commit -m "fix: prevent mock listings in production artifacts"
~~~

이 경로 안에서도 이번 작업 diff만 선택한다. 다른 작업의 변경이 있으면 파일 전체 대신 git add -p를 사용한다.

### Task A3: 실제 DB 권한 검사와 브라우저 검사 기반

> 2026-09-11 D3 실제 상태: [A3 live RLS/CI 기반](../../launch-evidence/rls-matrix.md), [D2 최종498DB/27browser](../../launch-evidence/release-candidate.md). 실제 GitHub-hosted Actions run은 별도 미검증이며 연결 코드 검증과 구분한다.

**예상:** 8~12시간. **선행:** A2. **산출:** “SQL 문구가 있다”를 넘어 실제 PostgreSQL의 차단을 CI에서 검증.

**Files:** Create supabase/tests/database/launch_rls.test.sql, tests/e2e/public.spec.ts, playwright.config.ts. Modify package.json, package-lock.json, .github/workflows/ci.yml. Add docs/launch-evidence/rls-matrix.md.

**Interfaces:** npm run test:db → supabase test db --local. npm run test:e2e → playwright test. assertions는 anon/authenticated 역할로 실행한다.

- [x] **A3.1 Docker가 가동된 disposable 환경에서 기존 migration을 적용한다.**

~~~bash
supabase start
supabase db reset --local
supabase test db --local
~~~

기존 local DB가 있으면 이 환경을 재사용하지 않고 실행용 worktree의 별도 Supabase project_id/포트를 사용한다. reset은 여기의 폐기 가능한 local DB에만 허용한다.

- [x] **A3.2 실제 권한 테스트를 작성한다.** 기존 seed ID를 사용한 최소 pgTAP 검사:

~~~sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
update public.jobs set moderation_status = 'pending', boost = null
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.jobs
   where id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and moderation_status = 'pending'),
  1::bigint, 'the private target fixture really exists'
);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is(
  (select count(*) from public.jobs
   where company_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and moderation_status = 'pending'),
  0::bigint, 'another employer cannot read private jobs'
);
select is(
  (select count(*) from public.profiles
   where id = '11111111-1111-1111-1111-111111111111'),
  0::bigint, 'another employer cannot read a private profile'
);
select * from finish();
rollback;
~~~

각 negative case 전에 privileged 구간에서 대상 행 존재를 확인한다. 위 코드는 seed 공고 한 건을 transaction 안에서 pending으로 바꾸고 존재를 확인한 후 다른 고용주 역할로 접근한다. rollback으로 원본 상태를 복구한다. 테스트 수 plan()은 실제 assertion 수와 일치시킨다.

- [x] **A3.3 다음 행렬의 positive/negative case를 각각 추가한다.**

| 호출자 | 성공 | 반드시 실패/비노출 |
|---|---|---|
| anon | 공개 공고/안전 회사 identity | pending·지원자·메시지·audit·신고자 |
| seeker A | 자기 지원 생성/이력 | seeker B 기록, 중복 지원, 자기 employer/admin 승격 |
| employer A | 본인 회사/공고, 본인 공고 지원자 | employer B 지원자·메시지, 자기 공고 승인, verification 변경 |
| admin aal1 | 본인 보안 설정 | A4 이후 관리자 심사 mutation |
| admin aal2 | 심사·신고·제재 | 사용자 권한을 흉내 낸 무인증 접근 |
| demoted/suspended | 정의된 본인 이력 | 기존 소유권만으로 신규 쓰기 |

jobs/companies의 base table과 public view를 모두 호출한다. 공개하지 않을 회사 phone/owner_id가 raw REST에서 보이면 grant/RLS 또는 공개 컬럼 계약을 수정하고 기존 내부 호출도 회귀 검사한다. 외부 회사의 모든 정보를 삭제하는 식으로 권한 오류를 숨기지 않는다.

- [x] **A3.4 브라우저 실행과 CI를 연결한다.**

~~~bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
~~~

~~~ts
import { test, expect } from "@playwright/test";
test("public jobs and protected employer entry", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: "공고 둘러보기", exact: true })).toBeVisible();
  await page.goto("/employer/jobs/new");
  await expect(page).toHaveURL(/\/login\?next=/);
});
~~~

CI 추가 순서: Supabase CLI의 검증된 버전 설치→start→local reset→test:db→local URL/key를 로그 없이 job environment에 연결→build→Next start→test:e2e→항상 local stack 종료. OAuth provider 자동화는 mock으로 대체해 “Google E2E 통과”라고 기록하지 않는다. 실제 provider는 D2에서 브라우저로 별도 검증한다.

- [x] **A3.5 구현한 전체 행렬을 통과시키고 커밋한다.**

~~~bash
npm run test:db
npm run test:e2e
git add supabase/tests tests/e2e playwright.config.ts package.json package-lock.json .github/workflows/ci.yml docs/launch-evidence/rls-matrix.md
git commit -m "test: verify live database authorization and browser flows"
~~~

### Task A4: 로그인 복귀·표시 이름·관리자 MFA 완성

> 2026-09-11 D3 실제 상태: [Auth/MFA 구현·로컬 검사](../../launch-evidence/auth-mfa.md), [D2 세션/역할 회귀](../../launch-evidence/release-candidate.md). 실제 Google와 hosted 계정 inventory는 미완료다.

**예상:** 12~16시간. **선행:** A3. **산출:** 실제 Google 계정으로 가입/복귀하고 운영 권한이 보호됨.

**Files:**
- Modify src/lib/supabase/proxy.ts, src/lib/auth/session.ts, types.ts, guards.ts, access.ts, src/lib/db/profiles.ts, src/app/auth/callback/route.ts, src/components/auth/AuthCard.tsx, SocialAuthButtons.tsx.
- Create src/app/dashboard/profile/page.tsx, ProfileForm.tsx, actions.ts; src/app/account/security/page.tsx, MfaForm.tsx; tests/auth-session-refresh.test.ts, tests/profile-actions.test.ts.
- Create supabase/migrations/20260909000100_profile_and_admin_security.sql and supabase/tests/database/admin_mfa.test.sql.

**Interfaces:** updateOwnProfile(formData)→{status:"success"|"error",message:string}; profile only display_name/city, authenticated self ID. AuthUser carries aal:"aal1"|"aal2" and accountStatus:"active"|"suspended". getAuthProfileForUser(id:string)→Promise<{role:Role;accountStatus:"active"|"suspended";displayName:string|null}|null>을 profiles.ts에 정의해 role/status/name을 한 번에 읽는다. 기존 helper 호출자도 새 계약으로 갱신한다. requireRole("admin") routes aal1 users to /account/security. DB is_admin() requires active admin and aal2.

- [x] **A4.1 회귀 검사부터 추가한다.**

~~~ts
import { expect, test } from "vitest";
import { canUseAdmin } from "@/lib/auth/access";
test("an admin role alone does not grant privileged access", () => {
  expect(canUseAdmin({ role: "admin", aal: "aal1" })).toBe(false);
  expect(canUseAdmin({ role: "admin", aal: "aal2" })).toBe(true);
});
~~~

이 task에서 src/lib/auth/access.ts에 canUseAdmin(user:{role:Role;aal:"aal1"|"aal2"}):boolean을 추가한다. 계정 MFA 여부와 Supabase session aal을 혼동하지 않는다.

- [x] **A4.2 proxy 쿠키 전달을 수정하고 동일 요청 갱신을 검사한다.**

~~~ts
setAll(cookiesToSet, headers) {
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
  response = NextResponse.next({ request });
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) =>
    response.headers.set(name, value));
}
~~~

기존 const response는 let으로 바꾼다. 설치된 @supabase/ssr 0.12의 SetAllCookies는 두 번째 인자로 Cache-Control/Expires/Pragma를 전달하므로 반드시 보존한다. auth callback redirect에도 private/no-store 응답을 적용한다. 테스트에서는 새 request/response 쿠키, 갱신 응답의 캐시 금지, health의 auth 우회를 함께 확인한다.

- [ ] **A4.3 프로필 입력과 안전한 callback 복귀를 구현한다.**

> 분리 상태: 프로필/callback·검증된 Auth 연락처 구현 및 local phone-only0 확인 완료. 실제 hosted phone-only 계정 수/이전 목록은 UNVERIFIED이므로 혼합 단계는 미완료 유지.

~~~ts
const displayName = String(formData.get("displayName") ?? "").trim();
if (displayName.length < 1 || displayName.length > 80) {
  return { status: "error" as const, message: "표시 이름은 1~80자로 입력해 주세요." };
}
const user = await requireUser("/dashboard/profile");
const supabase = await createSupabaseServerClient();
const { error } = await supabase.from("profiles")
  .update({ display_name: displayName }).eq("id", user.id);
~~~

폼 값의 role/id/email은 업데이트 payload에 넣지 않는다. 신규 사용자는 프로필 완료 후 sanitizeNextPath를 통과한 원래 지원 페이지로 복귀한다. 알림/지원자 연락처는 확인된 Auth 이메일을 사용한다. 기존 phone-only 계정은 개수만 확인해 대표의 계정 이전 목록으로 남기고 강제 삭제하지 않는다.

- [x] **A4.4 Supabase의 TOTP 등록/확인 UI와 DB admin gate를 구현한다.**

공식 [Supabase MFA 문서](https://supabase.com/docs/guides/auth/auth-mfa/totp)를 읽고 enroll→challenge→verify 흐름을 적용한다. QR secret을 로그나 git에 저장하지 않는다.

~~~sql
alter table public.profiles
  add column account_status text not null default 'active'
  check (account_status in ('active', 'suspended'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.current_profile_role() = 'admin'
    and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.account_status = 'active'
    );
$$;

create or replace function public.guard_profile_status_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.account_status is distinct from old.account_status
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'account_status is a trusted field' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_account_status
before update of account_status on public.profiles
for each row execute function public.guard_profile_status_change();
~~~

기존 SQL에서 role='admin'을 직접 검사하는 RPC/정책도 rg로 찾아 is_admin()으로 일관화한다. SECURITY DEFINER라는 이유로 admin aal1이 우회할 수 없게 한다. 첫 admin 생성/분실 복구는 별도 trusted 운영 절차로 제한한다.

- [ ] **A4.5 실제 계정과 오류 시나리오를 검증한다.**

> 분리 상태: 로컬 PKCE/TOTP/AAL2/분리·만료 검증 완료. 실제 Google 신규/재로그인/취소/복귀 행렬은 NOT RUN; Kakao/Naver/Phone은 비활성 유지.

Google 신규 가입, 재로그인, 취소, 잘못된 callback, 세션 만료, 원래 apply 페이지 복귀, 로그아웃, 동명이인 계정 분리, admin aal1 차단/aal2 성공을 확인한다. Kakao는 같은 검사를 모두 통과하면 flag를 켠다. Naver/Phone은 false이고 공개 화면에 미설정 개발 안내를 숨긴다.

~~~bash
npm test -- tests/auth-session-refresh.test.ts tests/profile-actions.test.ts tests/auth-production-safety.test.ts tests/auth-redirect-safety.test.ts
npm run test:db
npm run typecheck
npm run lint
~~~

- [x] **A4.6 관련 파일만 선택해 커밋한다.**

~~~bash
git add -p
git commit -m "feat: complete profile onboarding and protect admin sessions"
~~~

## 이 계획의 완료 기준

A1~A4의 명령 결과와 실제 provider 확인 결과가 docs/launch-evidence/에 있으며, 검사 미수행을 PASS로 기록하지 않는다. 이 단계 완료는 배포 준비 기반의 완료이고 공개 출시 결정은 전체 실행 계획 D3에서 한다.
