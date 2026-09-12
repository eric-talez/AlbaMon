# California Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CA 전역에서 정확히 검색하고, 공고 편집·마감·재심사와 본인 지원 철회를 완료한다.

**Architecture:** 기존 테이블의 state, expires_at, moderation_status, audit_logs를 재사용한다. 공개 가능 여부는 DB에서 한 조건으로 정의하고 모든 공개 조회와 신규 지원에 적용한다. 페이지 수와 역할 전환 후 과거 접근도 기존 helper/RPC에 보완한다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres/RLS/RPC, Vitest, pgTAP, Playwright.

**Spec:** [CA 출시 설계](../specs/2026-09-09-california-launch-design.md)의 3·5·6장.

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

## 파일과 계약 지도

| 책임 | 위치 |
|---|---|
| CA copy, 지역 선택 | src/lib/site.ts, src/components/JobFilters.tsx, public pages |
| 공고 검색/페이지/도시 목록 | src/lib/db/jobs.ts |
| 공고 공개 판단 | 새 migration의 is_job_open(uuid), public_job_listings |
| 편집·마감 UI | src/app/employer/jobs/[id]/edit/, 기존 jobs 목록 |
| 심사와 검토 이유 | src/lib/db/admin-moderation.ts, 기존 admin/jobs |
| 지원 상태/철회 | src/lib/applications/status-action.ts, 기존 지원 대시보드 |
| 과거 지원/대화 관계 | 기존 application listing/thread RPC와 message helper |

순서: A4 완료→B1→B2→B3. 예전 migration을 수정하지 않고 아래 새 migration을 순서대로 추가한다. 모든 날짜 접미사는 같은 날 동시에 만드는 migration이 있다면 timestamp 충돌 없이 증가시킨다.

### Task B1: CA 도시 탐색, 급여 의미, 페이지 처리

> 2026-09-11 D3 실제 상태: [CA 검색/alias·기존 데이터 큐레이션](../../launch-evidence/environments.md), [D2 최종DB/browser](../../launch-evidence/release-candidate.md). 실제 hosted 기존 행 확인과 page500/RPC 잔여는 [인수인계](../../launch-evidence/production-release.md)에 분리했다.

**예상:** 8~12시간. **산출:** LA/OC 밖 CA 공고도 찾고 급여가 같은 단위로 비교됨.

**Files:**
- Modify src/lib/site.ts, src/lib/types.ts, src/lib/db/jobs.ts, src/lib/db/types.ts, src/lib/employer/validation.ts, src/components/JobFilters.tsx.
- Modify src/app/(public)/page.tsx, jobs/page.tsx, src/app/layout.tsx, src/app/employer/jobs/new/JobForm.tsx.
- Create supabase/migrations/20260909000200_ca_job_search.sql.
- Update tests/job-search.test.ts, tests/employer-validation.test.ts, tests/smoke-public-pages.test.ts; create tests/e2e/ca-search.spec.ts.

**Interfaces:**

~~~ts
export interface JobSearchParams {
  q?: string;
  city?: string;
  category?: JobCategory;
  jobType?: JobType;
  languageRequirement?: LanguageRequirement;
  payUnit?: PayUnit;
  payMin?: number;
  sort?: "newest" | "pay_high" | "pay_low";
  page?: number;
}
export interface JobSearchResult {
  jobs: Job[];
  page: number;
  hasNext: boolean;
}
// src/lib/db/jobs.ts
// searchApprovedJobs(params: JobSearchParams): Promise<JobSearchResult>
// getPublicJobCities(): Promise<string[]>
~~~

JobCategory/JobType/LanguageRequirement/PayUnit/Job은 기존 src/lib/types.ts 타입이다. 이후 모든 목록 caller는 result.jobs를 렌더링한다.

- [x] **B1.1 잘못된 급여·지역 동작을 실패 테스트로 고정한다.**

~~~ts
test("pay filter without unit explicitly means hourly", () => {
  expect(parseJobSearchParams({ payMin: "20", sort: "pay_high" }))
    .toMatchObject({ payMin: 20, payUnit: "hour", sort: "pay_high" });
});
test("invalid page safely returns the first page", () => {
  expect(parseJobSearchParams({ page: "-1" }).page).toBe(1);
});
~~~

기존 mock fixture를 사용하되 추가 case로 시급 18~25와 시급 22~25, 연봉 60,000을 넣는다. “시급 최소 20” 결과는 시급 22~25만 포함해야 한다. San Jose/Sacramento/San Diego 공고와 NV 공고를 DB fixture로 만들어 CA만 노출하는 검사도 추가한다.

- [ ] **B1.2 공개 근무지와 급여 validation을 바꾼다.**

> 분리 상태: CA/pay DB·서버 validation과 로컬 inventory 완료. hosted 원본 행/실제 근무지·급여 확인과 필요 시 대표의 정상 보정 결정은 UNVERIFIED.

~~~ts
// parseEmployerJobForm 안에서 검증. 회사 본사 주소 validation과 분리한다.
if (state.value !== "CA") {
  return { ok: false, message: "현재는 캘리포니아 근무지 공고만 등록할 수 있습니다." };
}
if (payMin.value <= 0) {
  return { ok: false, message: "0보다 큰 기본 급여를 입력해 주세요. 팁은 별도입니다." };
}
~~~

DB의 INSERT/관련 UPDATE trigger에서도 state='CA', pay_min>0을 검사한다. B1 단계의 public_job_listings에도 state='CA' 조건을 넣고 B2에서 통합 공개 조건으로 교체한다. 기존 타주/0급여 행이 있으면 사전 조회 결과와 보정 계획을 대표에게 제시한다. 원본 데이터를 삭제하거나 0급여를 임의 최저임금으로 바꾸지 않는다.

- [x] **B1.3 query를 같은 단위·정확한 하한·안정된 페이지로 바꾼다.**

~~~ts
if (params.payUnit) query = query.eq("pay_unit", params.payUnit);
if (params.payMin !== undefined) query = query.gte("pay_min", params.payMin);
const page = params.page ?? 1;
const from = (page - 1) * 20;
query = query.order(
  params.sort === "pay_high" || params.sort === "pay_low" ? "pay_min" : "posted_at",
  { ascending: params.sort === "pay_low" },
).order("id", { ascending: false }).range(from, from + 20);
// fetchedRows는 이 query 결과를 기존 mapRow로 변환한 Job[]이다.
return { jobs: fetchedRows.slice(0, 20), page, hasNext: fetchedRows.length > 20 };
~~~

q는 최대 200자, city는 최대 100자, page는 1~500으로 제한한다. DB에서 필터링 후 클라이언트에서 다시 결과를 걸러 페이지를 비우는 후처리는 제거하고 DB/mock 의미를 회귀 검사한다. 실제 10,000개를 넘는 공개 재고가 쌓이면 cursor로 전환한다.

- [ ] **B1.4 데이터에서 도시 선택지를 만들고 CA 문구로 바꾼다.**

> 분리 상태: 데이터 기반 CA 도시 UI와 정확한 Los Angeles (Koreatown) alias 구현/회귀 완료. 실제 hosted 기존 표기 inventory/대표 원본 확인은 UNVERIFIED; 임의 도시 일괄 정규화 없음.

~~~sql
create or replace function public.list_public_job_cities()
returns table(city text)
language sql stable security definer set search_path = ''
as $$
  select distinct p.city
  from public.public_job_listings p
  where p.state = 'CA'
  order by p.city;
$$;
revoke all on function public.list_public_job_cities() from public;
grant execute on function public.list_public_job_cities() to anon, authenticated;
~~~

함수는 공개 view만 읽는다. cities를 props로 JobFilters에 전달하고 데이터가 없을 때에는 “CA 전체”와 검색 입력을 제공한다. 도시 이름 전체를 새 라이브러리/지도 API로 관리하지 않는다. Los Angeles (Koreatown) 같은 기존 표기는 migration 전에 대표가 정규화 기준을 확인한다. 저장은 “Los Angeles”, 상세 위치는 address_display에 남기는 안을 적용한다.

- [x] **B1.5 필터 유지·초기화·다음 페이지·검색 결과 0건을 검사한다.**

~~~bash
npm test -- tests/job-search.test.ts tests/employer-validation.test.ts tests/smoke-public-pages.test.ts
npm run test:db
npm run test:e2e -- tests/e2e/ca-search.spec.ts
~~~

데이터 21건일 때 1페이지 20건/2페이지 1건, 필터 변경 시 page=1, 급여 단위 표시, 같은 날짜의 timestamp 순서, JS 없는 GET form을 확인한다. 홈페이지/metadata/footer에 LA/OC 한정 문구가 남지 않는다.

- [x] **B1.6 관련 파일을 선택해 커밋한다.**

~~~bash
git add -p
git commit -m "feat: support California search with consistent pay and pagination"
~~~

### Task B2: 공고 편집·마감·재심사·게시 중지와 감사 이력

> 2026-09-11 D3 실제 상태: [수명주기·기존 expiry/publication 증거](../../launch-evidence/environments.md), [D2 최종회귀](../../launch-evidence/release-candidate.md). owner 만료 public 링크는 C4에서 해결됐고 실제 legacy 조정은 대기다.

**예상:** 12~18시간. **산출:** 채용이 끝나거나 문제가 생긴 공고를 즉시 내릴 수 있음.

**Files:**
- Create supabase/migrations/20260909000300_job_lifecycle.sql, supabase/tests/database/job_lifecycle.test.sql.
- Modify src/lib/db/jobs.ts, employer-jobs.ts, admin-moderation.ts, applications.ts, reports.ts, types.ts; src/lib/types.ts.
- Create src/app/employer/jobs/[id]/edit/page.tsx, actions.ts; reuse/extend src/app/employer/jobs/new/JobForm.tsx.
- Modify src/app/employer/jobs/page.tsx, src/app/admin/jobs/page.tsx, actions.ts, JobModerationForm.tsx.
- Create tests/job-lifecycle.test.ts, tests/e2e/job-lifecycle.spec.ts.

**Interfaces:**
- is_job_open(target_job_id uuid)→boolean.
- transition_job(target_job_id uuid, command text, expected_updated_at timestamptz, reason text default null)→table(status text, job_id uuid); status is updated/conflict/not_allowed.
- command values: approve, reject, pause, close, resubmit.
- get_job_review_note(target_job_id uuid)→table(reason text, reviewed_at timestamptz); caller own company/employer or admin AAL2 only.
- updateEmployerJob(jobId:string, expectedUpdatedAt:string, input:EmployerJobInput)→{status:"updated"|"conflict"|"not_allowed"|"error"}.
- Job에 expiresAt:string을, 공개 row 타입에 expires_at/updated_at을 추가한다. PUBLIC_JOB_SELECT와 mapRow, 개발 mock fixture도 갱신한다. public view의 기존 컬럼 순서는 유지하고 두 시각 필드는 마지막에 추가한다. C4는 이 필드를 소비한다.

- [x] **B2.1 공개/지원 차단을 DB 테스트로 먼저 작성한다.**

~~~sql
-- local pgTAP transaction 안에서 seed 공고의 만료 시각을 지난 값으로 둔다.
update public.jobs set expires_at = now() - interval '1 second'
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is(
  public.is_job_open('bbbbbbbb-0000-0000-0000-000000000001'),
  false, 'an expired approved job is closed'
);
~~~

처음에는 함수가 없어 실패한다. anonymous view 조회와 seeker INSERT에서도 동일하게 비노출/실패하는 assertion을 추가한다. 수정→pending, close 후 재지원, 다른 고용주 수정, 같은 updated_at으로 두 번 변경도 검사한다.

- [x] **B2.2 공개 조건을 DB에 하나로 정의한다.**

~~~sql
create or replace function public.is_job_open(target_job_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    join public.companies c on c.id = j.company_id
    join public.profiles p on p.id = c.owner_id
    where j.id = target_job_id
      and j.state = 'CA'
      and j.moderation_status = 'approved'
      and j.expires_at > now()
      and p.account_status = 'active'
  );
$$;
revoke all on function public.is_job_open(uuid) from public;
grant execute on function public.is_job_open(uuid) to anon, authenticated;
~~~

account_status는 A4에서 생성한다. public_job_listings는 기존 컬럼 순서를 유지하고 WHERE를 is_job_open(j.id)로 바꾼다. 이 함수는 RLS 재귀 없이 소유자 권한으로 고정된 테이블만 읽는다. pending 자체나 개인 정보를 반환하지 않는다.

jobs 공개 SELECT policy, applications INSERT, report의 공개 공고 검사, 양쪽 application listing의 job_is_public을 이 조건으로 바꾼다. 서비스 DB helper도 일치시킨다. 승인과 지원/마감이 경합하는 경우 공고 row lock 아래에서 공개 조건을 확인하도록 신규 지원 transaction을 보강한다.

- [x] **B2.3 transition RPC와 편집 payload를 구현한다.**

RPC는 auth.uid()에서 주체를 구하고 row FOR UPDATE→역할/소유권/예상 시각→허용 전환→변경→audit 순서로 실행한다. approve는 admin AAL2이고 pending만 가능하다. reject/pause의 관리자 사유는 1~500자이다.

~~~sql
-- 승인 branch의 update 값:
update public.jobs
set moderation_status = 'approved',
    posted_at = now(),
    expires_at = now() + interval '30 days'
where id = target_job_id;
-- 마감 branch의 update 값:
update public.jobs
set moderation_status = 'expired', expires_at = now()
where id = target_job_id;
~~~

위 SQL은 검증을 마친 RPC 내부에서만 사용한다. owner의 직접 REST update에도 승인 보호가 유지되도록 RLS/trigger를 함께 검사한다. 공고 편집은 기존 parseEmployerJobForm의 전체 validation과 현재 DB 소유권을 사용하고, 새 company_id/boost/posted_at을 사용자에게 받지 않는다.

~~~ts
const { data, error } = await supabase.from("jobs")
  .update({ ...validatedJobColumns, moderation_status: "pending" })
  .eq("id", jobId).eq("updated_at", expectedUpdatedAt)
  .select("id").maybeSingle();
~~~

validatedJobColumns는 createEmployerJob의 현재 필드 mapping을 같은 파일의 toEmployerJobColumns(input:EmployerJobInput)로 추출해 재사용한다. 객체 전체 spread로 FormData를 DB에 넘기지 않는다.

- [x] **B2.4 조치 이력을 남기고 고용주에게 필요한 이유만 보여준다.**

~~~sql
insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
values (auth.uid(), 'job.rejected', 'job', target_job_id,
        jsonb_build_object('reason', reason));
~~~

RPC 변경과 같은 transaction에 저장한다. 추가 trigger는 직접 trusted update의 상태/검증 변경도 기록한다. 일반 사용자에게 audit_logs insert/update 권한을 주지 않는다. get_job_review_note는 auth.uid()와 companies.owner_id를 검사한 뒤 해당 job의 최근 job.rejected/job.paused 이유만 반환한다.

- [ ] **B2.5 UI와 과거 행 처리를 연결한다.**

> 분리 상태: owner/admin UI 및 NULL expiry fail-closed 구현/로컬 확인 완료. 실제 운영 legacy 추출·대표 확인·재심사/중지는 NOT RUN; 게시일 불명 행의 날짜를 만들지 않음.

고용주 jobs 목록: 편집/마감 버튼, 현재 status, 반려 이유. 관리자 jobs: pending/approved/paused 필터, 공개 중지와 사유 입력. 손실 가능 편집/마감에는 대상 제목을 보여준다. 관련 public/detail/dashboard 경로를 revalidate한다.

기존 approved/expires_at null 행은 먼저 운영자 확인 목록으로 추출한다. 새로 확인한 실제 공고만 승인 시각+30일로 연장하고 확인하지 못한 공고는 paused 처리한다. seed는 로컬에서만 미래 만료 시각을 넣어 테스트를 유지한다.

- [x] **B2.6 종료 조건을 검사하고 커밋한다.**

~~~bash
npm run test:db
npm test -- tests/job-lifecycle.test.ts tests/db-applications.test.ts tests/db-reports.test.ts
npm run test:e2e -- tests/e2e/job-lifecycle.spec.ts
git add -p
git commit -m "feat: add reviewed job edits closure and moderation history"
~~~

만료는 cron 지연과 무관하게 WHERE 조건으로 즉시 적용된다. 보기 좋게 status를 expired로 바꾸는 정리 작업은 별개이며 공개 통제를 그 작업에 의존하지 않는다.

### Task B3: 구직자 철회, 과거 기록과 대화 보존

> 2026-09-11 D3 실제 상태: [D2 최종DB/browser 및 rollback 후 이력·새 쓰기](../../launch-evidence/release-candidate.md), [복구 상세](../../launch-evidence/restore-drill.md). 실제 staging 적용/계정 검증은 D단계와 구분한다.

**예상:** 6~10시간. **산출:** 역할 변경/마감 이후에도 자기 기록을 잃지 않음.

**Files:**
- Create supabase/migrations/20260909000400_application_lifecycle.sql, supabase/tests/database/application_lifecycle.test.sql.
- Modify src/lib/applications/status-action.ts, src/lib/db/applications.ts, messages.ts, src/lib/messages/action.ts.
- Modify src/app/dashboard/applications/page.tsx, 양쪽 application message pages/actions, src/app/employer/applications/page.tsx.
- Modify src/components/applications/ApplicationStatusControl.tsx, MessageThread.tsx, 관련 Vitest tests; create tests/e2e/application-lifecycle.spec.ts.

**Interfaces:**
- withdraw_application(target_application_id uuid, expected_updated_at timestamptz)→table(status text).
- list_seeker_applications는 기존 반환에 application_updated_at을 추가하고 현재 역할과 무관하게 자기 seeker_id 행만 반환한다.
- get_application_thread_context는 participant_side:"applicant"|"employer"|"admin"을 추가한다.
- getApplicationThread(applicationId,currentUserId,page=1)는 50개/페이지와 hasOlder를 반환한다.
- sendMessageForParticipant(formData:FormData)→기존 MessageFormState. requireUser 후 DB에서 실제 당사자를 검사한다.

- [x] **B3.1 다음 4개를 실패 검사로 작성한다.**

~~~ts
test("employer UI cannot claim applicant withdrawal", () => {
  expect(EMPLOYER_APPLICATION_STATUSES).not.toContain("withdrawn");
});
test("withdrawal is terminal for employer edits", () => {
  expect(canEmployerChangeStatus("withdrawn", "reviewing")).toBe(false);
});
~~~

이 task에서 src/lib/applications/status-action.ts에 EMPLOYER_APPLICATION_STATUSES와 canEmployerChangeStatus(from:ApplicationStatus,to:ApplicationStatus):boolean을 정의한다. 추가 DB 검사 2개: 타 지원자 철회 실패, seeker→employer 승격 후 과거 본인 이력/대화만 접근 성공.

- [x] **B3.2 본인 철회 RPC와 DB 상태 보호를 구현한다.**

~~~sql
update public.applications
set status = 'withdrawn'
where id = target_application_id
  and seeker_id = auth.uid()
  and updated_at = expected_updated_at
  and status in ('submitted', 'reviewing', 'interview', 'offered')
returning id;
~~~

RPC는 현재 계정 active 확인과 충돌 응답을 포함한다. 고용주 update policy/trigger는 withdrawn으로의 변경 및 withdrawn에서의 변경을 차단한다. 이미 철회된 동일 요청은 저장을 반복하지 않고 “이미 철회됨”으로 응답한다.

- [x] **B3.3 당사자 관계로 과거 대화 권한과 수신자를 결정한다.**

~~~sql
-- can_access_application_thread와 context 안의 관계:
(a.seeker_id = auth.uid())
or (c.owner_id = auth.uid() and public.current_profile_role() = 'employer')
or public.is_admin()
~~~

이 표현은 원래 application_id 제한과 함께 사용한다. 알림의 상대방은 현재 role이 아니라 sender_id가 a.seeker_id인지로 구분한다. 관리자 읽기 권한은 AAL2를 요구하고 관리자라는 이유만으로 대화 발신 권한을 부여하지 않는다. company/job가 마감되어도 원래 관계를 유지한다.

- [x] **B3.4 이력/메시지 페이지와 서버 시각 표시를 보완한다.**

지원 목록은 20개/페이지, 메시지는 최신 50개를 먼저 읽어 역순 렌더링하고 이전 50개 탐색을 제공한다. 새 답장 후 현재 페이지를 갱신하며 수신자가 새로고침할 수 있는 버튼을 제공한다. 실시간 수신 기능이라고 표시하지 않는다.

~~~ts
new Intl.DateTimeFormat("ko-KR", {
  timeZone: "America/Los_Angeles",
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(message.createdAt));
~~~

UI에 PT를 병기한다. 51개 메시지의 첫 메시지까지 접근되는지, 마감된 공고에서도 양쪽 기존 대화가 열리는지 검사한다.

- [x] **B3.5 회귀 검증 후 커밋한다.**

~~~bash
npm run test:db
npm test -- tests/application-status-action.test.ts tests/db-messages.test.ts tests/messaging-actions.test.ts
npm run test:e2e -- tests/e2e/application-lifecycle.spec.ts
git add -p
git commit -m "feat: preserve application history and allow applicant withdrawal"
~~~

## 완료 증거

LA/OC 밖의 실제 CA 도시 검색, 시급/연봉 분리, 공고 변경/마감 즉시 반영, 신고 시 관리자 중지, 구직자 본인 철회, 승격 후 과거 대화, 다른 사람 접근 차단을 staging에서 확인한다. 이는 실제 고용이나 임금 적법성을 플랫폼이 보증한다는 뜻이 아니다.
