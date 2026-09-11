# Launch Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대표 1명이 알림·신고·개인정보 요청과 공개 출시 품질을 관리할 수 있게 만든다.

**Architecture:** 기존 관리자 화면과 Postgres를 확장한다. 알림은 작은 DB outbox와 예약 worker로 처리하고, 악용 방지는 DB 쓰기 경계에서 적용한다. 법적 문구와 운영 절차는 실제 사업 정보 및 외부 검토를 거쳐 게시한다.

**Tech Stack:** Next.js, Supabase/Postgres, Resend, Vercel Cron, Vitest, pgTAP, Playwright.

**Spec:** [CA 출시 설계](../specs/2026-09-09-california-launch-design.md)의 4·7·8·9·10장.

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

## 파일 책임

| 책임 | 파일 |
|---|---|
| 발송 대기·중복·재시도 상태 | notification_outbox migration |
| 확인된 주소로 provider 발송 | src/lib/notifications/email.ts |
| 예약 실행 | src/app/api/internal/notifications/route.ts, vercel.json |
| 수신 거부·bounce 처리 | profile 알림 설정, email webhook |
| 계정 제재·새 글 중지 | 기존 admin 화면, DB RPC/trigger |
| 정책 본문·동의 기록 | 기존 4개 public policy pages, consent migration |
| error/404/SEO/핵심 지표 | Next 파일 convention과 기존 analytics helper |

기술 작업 선행은 B3이다. 대표의 정책 검토 의뢰·도메인 확보·공고 공급 확보는 A 단계부터 시작한다. 법무를 맡을 내부 직원이나 상시 CS 인력을 가정하지 않는다.

### Task C1: 실제 이메일, 재시도, 수신 제어

> 2026-09-11 D3 실제 상태: [알림 현재 계약/실제 activation 절차](../../OPERATIONAL_HEALTH.md), [D2 local provider-double5PASS](../../launch-evidence/release-candidate.md). 실제 발송·DNS·provider webhook·Production cron 증거는 없다.

**예상:** 14~20시간. **산출:** 앱을 열지 않은 사람도 지원/답변을 알고 대표도 대기열을 놓치지 않음.

**Files:**
- Create supabase/migrations/20260909000500_notification_outbox.sql, supabase/tests/database/notification_outbox.test.sql.
- Create src/lib/notifications/email.ts, worker.ts, src/app/api/internal/notifications/route.ts, src/app/api/webhooks/email/route.ts, vercel.json.
- Modify src/lib/notifications/dev.ts, src/lib/ops/health.ts, src/app/admin/page.tsx, profile form/actions, src/proxy.ts.
- Modify .env.example, package.json/package-lock.json, scripts/check-release-env.mjs, docs/PRODUCTION_ENV_VARS.md.
- Create tests/notification-worker.test.ts, tests/email-webhook.test.ts.

**Interfaces:**
- enqueue_notification(p_kind text, p_recipient_id uuid, p_entity_id uuid, p_event_key text)→void; DB trigger 내부 전용.
- claim_notification_batch(batch_size integer)→notification_outbox rows; service_role만 execute, 초기 최대 5.
- runNotificationBatch():Promise<{sent:number;retry:number;failed:number;suppressed:number}>.
- sendNotificationEmail({eventId,to,path}):Promise<{providerId:string}>. text는 고정 안내, path는 허용된 내부 route.
- GET /api/internal/notifications: CRON_SECRET bearer 인증. POST /api/webhooks/email: provider 서명 검증.

- [x] **C1.1 가장 위험한 실패를 테스트로 먼저 고정한다.**

DB transaction rollback 시 outbox도 없어야 한다. 같은 event_key의 중복 enqueue는 1행이어야 한다. worker 2개가 동시에 같은 행을 발송하지 않아야 한다. provider 429/5xx/timeout은 재시도하고 사용자 저장은 성공으로 남아야 한다.

~~~ts
test("notification text does not include application content", () => {
  const text = notificationText("/dashboard/applications");
  expect(text).toContain("/dashboard/applications");
  expect(text).not.toContain("cover_note");
});
~~~

이 task에서 email.ts의 notificationText(path:string):string은 “새 알림이 있습니다. 로그인 후 확인해 주세요.”와 고정 origin 링크만 만든다. 실제 검사는 임의의 메시지/연락처를 fixture로 넣어 provider payload에 나오지 않는지까지 확인한다.

- [x] **C1.2 outbox와 서비스 전용 권한을 만든다.**

~~~sql
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','suppressed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index notification_outbox_pending_idx
  on public.notification_outbox(available_at) where status in ('pending','sending');
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.notification_outbox to service_role;
~~~

kind CHECK는 application_submitted/application_status_changed/message_digest/job_reviewed/employer_access_requested/employer_access_reviewed/job_pending/report_opened만 허용한다. enqueue 함수도 사용자에게 execute를 grant하지 않는다. 알림 수량/실패 상태는 admin AAL2 전용 aggregate RPC로만 보여준다.

- [x] **C1.3 사용자 저장 transaction에서 이벤트를 생성한다.**

각 원본 테이블의 AFTER INSERT/관련 UPDATE trigger가 recipient를 관계로 계산한다. applications→공고 소유자, messages→실제 다른 참여자, 상태/심사 결과→신청자·소유자, 대기열→active 관리자. 사용자 payload가 to/recipient를 결정하지 않는다.

~~~sql
insert into public.notification_outbox(event_key, kind, recipient_id, entity_id)
values (p_event_key, p_kind, p_recipient_id, p_entity_id)
on conflict (event_key) do nothing;
~~~

메시지 event_key는 application ID+recipient ID+고정 10분 시간 bucket으로 만들고, 나머지는 원본 ID+event 종류+상태 변경 시각을 사용한다. 기존 emitDevNotification의 로그는 개발 검증용으로만 남기며 실발송을 동시에 호출하지 않는다.

- [x] **C1.4 worker claim/실패 복구를 구현한다.**

FOR UPDATE SKIP LOCKED로 due row를 최대 5개 고르고 sending/lease_until=now()+5분/attempts+1로 변경해 반환한다. attempts<5인 lease 만료 행만 회수하고 5회째의 성공 여부가 불명확하면 failed로 남긴다. 최초 1회+최대 4회 재시도이며 간격은 1/5/15/60분이다. worker maxDuration=120초, Auth/DB fetch timeout=5초, provider timeout=10초로 한 batch가 lease보다 먼저 종료되게 한다. 완료 update는 id와 claim 당시 attempts를 모두 비교한다. provider 성공 후 DB 기록만 실패해도 같은 event ID로 재시도한다.

~~~ts
const authUser = await supabase.auth.admin.getUserById(row.recipient_id);
const user = authUser.data.user;
if (!user?.email || !user.email_confirmed_at) {
  // markSuppressed(id: string, code: string): Promise<void>는 이 task의 DB helper.
  await markSuppressed(row.id, "unverified_recipient");
  continue;
}
~~~

active 상태와 email_notifications_enabled/suppressed_email도 확인한다. profiles에 두 boolean 필드를 추가하며 기본값은 true/false, 수신 거부 UI는 본인 email_notifications_enabled만 수정한다. suppressed_email은 A4의 trusted profile guard를 확장해 사용자 직접 수정을 막는다. bounce/complaint webhook만 trusted 경로로 설정한다. markSuppressed는 해당 outbox 행의 status='suppressed', last_error_code를 갱신하며 원문 주소를 저장하지 않는다.

Resend의 공식 SDK/서명 검증을 사용하고 package-lock을 함께 기록한다. 확인한 [idempotency 보장 기간은 24시간](https://resend.com/docs/dashboard/emails/idempotency-keys)이다. first_attempt_at에서 23시간을 넘겨 성공 여부가 불명확한 행은 자동 재발송 대신 failed로 분리한다. 실행 시 공식 보장 기간을 다시 확인한다.

이메일 링크의 route map: application_submitted→/employer/applications, application_status_changed→/dashboard/applications, job_reviewed→/employer/jobs, employer_access_requested→/admin/employer-requests, employer_access_reviewed→/employer/request-access, job_pending→/admin/jobs, report_opened→/admin/reports. message_digest는 수신자의 실제 참여 관계에 맞는 application messages route를 생성한다. 원본 메시지의 URL을 이메일 링크로 그대로 쓰지 않는다.

- [ ] **C1.5 예약 실행과 provider 연결을 구성한다.**

> 분리 상태: worker/서명 검증/cron 구성/환경 guard 완료. 실제 분리 Resend·DNS·허용받은 inbox 발송·signed provider webhook·Production schedule/plan은 UNVERIFIED. Preview cron 동작은 주장하지 않음.

~~~json
{
  "crons": [{ "path": "/api/internal/notifications", "schedule": "* * * * *" }]
}
~~~

~~~ts
const secret = process.env.CRON_SECRET;
if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
  return new Response(null, { status: 401 });
}
~~~

staging/production은 분리된 Resend key·webhook secret을 쓴다. staging 수신은 대표가 통제하는 테스트 주소 allowlist로 제한한다. SPF/DKIM/DMARC와 EMAIL_FROM 도메인 확인 후 실제 Gmail 한 건을 발송해 수신함·스팸함·bounce를 확인한다. 이는 실행 단계에서 대표가 허용한 테스트 발송으로 한다.

- [x] **C1.6 발송 관측과 중복/서명 검사를 통과시킨다.**

관리자 카드: pending 수, 가장 오래된 available_at, failed 수. 10분 이상 밀린 큐는 경보 대상이다. health는 provider key 존재와 실제 기능 활성화를 구분하고 더 이상 “key만 넣으면 configured”로 실발송을 암시하지 않는다.

~~~bash
npm test -- tests/notification-worker.test.ts tests/email-webhook.test.ts
npm run test:db
~~~

잘못된 webhook 서명 거부, 서명된 event 중복 처리 안전, bounce 이후 발송 중지, 탈퇴한 수신자 미발송, 알림 설정 off, worker 중단 후 재실행, 5회 실패의 관리자 노출까지 검증한다.

- [x] **C1.7 관련 diff만 커밋한다.**

~~~bash
git add -p
git commit -m "feat: deliver transactional notifications with retry and suppression"
~~~

### Task C2: 게시 중지·계정 정지·쓰기 한도·운영 이력

> 2026-09-11 D3 실제 상태: [moderation runbook/로컬 리허설](../../operations/moderation.md), [D2 final498DB/27browser](../../launch-evidence/release-candidate.md). 대표 실제 운영 인수인계는 미완료다.

**예상:** 10~14시간. **산출:** 악성 사용자가 API를 직접 호출해도 운영자가 대응할 수 있음.

**Files:**
- Create supabase/migrations/20260909000600_abuse_controls.sql, supabase/tests/database/abuse_controls.test.sql.
- Create src/app/admin/users/page.tsx, actions.ts; modify 기존 admin/reports, admin/page 및 db/admin-moderation.ts.
- Modify src/lib/auth/guards.ts, 각 writes의 오류 매핑, src/lib/db/admin-analytics.ts.
- Create docs/operations/moderation.md, tests/admin-suspension.test.ts.

**Interfaces:** suspend_account(target_user_id uuid, reason text)→void; admin AAL2만 호출. guard_active_writer()→trigger. enforce_write_limits()→trigger. 정지 해제는 별도 admin action이며 기존 공고를 자동 재공개하지 않는다.

- [x] **C2.1 실패 테스트를 만든다.**

자기 account_status 변경 실패, 정지 후 직접 REST message INSERT 실패, 다중 동시 message INSERT에서 한도 초과 차단, admin aal1 정지 RPC 실패를 검사한다. 단위 mock으로 제한하지 않고 A3 실제 DB suite에 넣는다.

- [x] **C2.2 정지 transaction과 쓰기 guard를 구현한다.**

~~~sql
-- admin AAL2 및 대상 != auth.uid() 확인을 마친 RPC 내부:
update public.profiles set account_status = 'suspended'
where id = target_user_id;
update public.jobs set moderation_status = 'paused'
where company_id in (
  select id from public.companies where owner_id = target_user_id
) and moderation_status in ('pending','approved');
insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
values (auth.uid(),'account.suspended','profile',target_user_id,
        jsonb_build_object('reason',reason));
~~~

profiles.account_status는 A4에서 생성된 active/suspended CHECK를 사용한다. 일반 사용자 자기 변경을 trigger로 거부한다. 고용주 역할을 seeker로 바꾸는 것으로 제재를 대신하지 않는다. 정지된 주체는 기존 JWT가 유효해도 DB의 최신 상태로 신규 쓰기가 막혀야 한다.

- [x] **C2.3 서버/DB에서 같은 쓰기 한도를 적용한다.**

| 쓰기 | actor 기준 | 한도 |
|---|---|---|
| jobs 생성 | companies.owner_id | 5개/24시간 |
| applications 생성 | seeker_id | 30개/24시간 |
| messages 생성 | sender_id | 20개/60초, 200개/24시간 |
| reports 생성 | reporter_id | 10개/24시간 |
| employer_access_requests 생성 | requester_id | 3개/24시간 |

~~~sql
perform pg_advisory_xact_lock(
  hashtextextended(auth.uid()::text || ':' || tg_table_name, 0)
);
-- 이 lock 이후 해당 actor와 created_at 구간의 count를 조회한다.
-- 초과 시 공통 오류:
raise exception 'write_rate_limited' using errcode = 'P0001';
~~~

실제 구현은 한도 초과 branch에서만 raise한다. count query에 사용하는 actor/created_at 복합 index를 추가한다. 공개 함수가 다른 사용자 ID를 인자로 받아 제한을 우회하지 못하게 auth.uid()로 actor를 고정한다. 오류는 “잠시 후 다시 시도해 주세요”로 매핑하고 원시 DB 메시지를 노출하지 않는다.

- [x] **C2.4 신고에서 실제 대응까지 연결한다.**

관리자 신고 상세→관련 공고 보기→공고 중지(B2 RPC)→사유 기록→신고 reviewed 처리 순으로 제공한다. “검토 완료”만으로 공고가 내려갔다고 표시하지 않는다. 회사 확인과 위험 공고 검토는 다른 상태로 표시한다. 보고한 사람의 이메일/이름을 고용주 화면이나 알림에 넣지 않는다.

admin의 회사 검증/고용주 권한 승인/신고 처리도 trusted trigger로 audit_logs에 기록한다. 기존 관리자 목록은 20개/페이지로 제한하고 oldest pending를 먼저 볼 수 있게 한다.

- [ ] **C2.5 운영 문서를 작성하고 대표가 리허설한다.**

> 분리 상태: 운영 문서와 local AAL2 리허설 완료. 실제 대표·대체 담당·지원 채널 확정 및 대표 리허설은 NOT RUN.

moderation.md에는 공고 체크 순서, 금지 표현과 정상 한국어 요건의 예, 급여/직무/연락처 확인, 실제 회사 확인 방법, 즉시 중지 조건, 반려 텍스트, 이의신청 경로, 복구 절차를 포함한다. 일반 접수 1영업일 첫 응답 목표와 부재 시 처리 방식을 명시한다.

- [x] **C2.6 검사 후 커밋한다.**

~~~bash
npm run test:db
npm test -- tests/admin-suspension.test.ts tests/report-actions.test.ts tests/admin-actions.test.ts
git add -p
git commit -m "feat: add enforceable abuse controls and moderation actions"
~~~

### Task C3: 실제 정책, 동의 기록, 개인정보 요청 처리

> 2026-09-11 D3 실제 상태: [정책 검토/CAS/보존 절차](../../legal/launch-policy-review.md), [privacy 범위/hold](../../operations/privacy-requests.md), [D2 실제 local privacy2PASS](../../launch-evidence/release-candidate.md). 실제 facts/prose는 draft이며 법률 검토로 간주하지 않는다.

**예상:** 개발/문서 4~8시간 + 대표/외부 검토 대기. **산출:** 공개 이용자가 누구에게 어떤 처리를 요청할 수 있는지 알 수 있음.

**Files:**
- Replace 본문: src/app/(public)/terms/page.tsx, privacy/page.tsx, posting-policy/page.tsx, work-authorization-info/page.tsx.
- Create src/lib/policies.ts, supabase/migrations/20260909000700_policy_acknowledgements.sql.
- Modify signup/profile form, employer JobForm/actions, src/components/SiteFooter.tsx, scripts/check-release-env.mjs.
- Create docs/legal/launch-policy-review.md, docs/operations/privacy-requests.md, tests/policy-acknowledgements.test.ts.

**Interfaces:**

~~~ts
// src/lib/policies.ts
export const TERMS_VERSION = "ca-launch-v1";
export const PRIVACY_NOTICE_VERSION = "ca-launch-v1";
export const POSTING_POLICY_VERSION = "ca-launch-v1";
~~~

profiles에 terms_version/terms_accepted_at/privacy_notice_version을, jobs에 posting_policy_version/posting_policy_acknowledged_at을 추가한다. 실제 시각은 DB now()로 찍는다. 사용자에게 약관 동의와 개인정보 안내 확인을 구분해 설명한다.

- [x] **C3.1 미완성 상태를 잡는 검사를 먼저 넣는다.**

~~~ts
for (const path of ["/terms", "/privacy", "/posting-policy", "/work-authorization-info"]) {
  const html = await (await fetch(baseUrl + path)).text();
  expect(html).not.toMatch(/Coming soon|준비 중/);
}
~~~

이 브라우저/HTTP 검사의 baseUrl은 A3의 local test server URL이다. 별도 source-string 테스트를 늘려 정책의 법적 적정성을 검증했다고 하지 않는다.

- [ ] **C3.2 대표가 사실과 정책 결정을 확인한다.**

> 분리 상태: 한국어 초안·영어 주요 안내/설정 구조 준비 완료. 운영자·지원·도메인·보관/적용일 결정 및 외부 검토는 UNVERIFIED.

| 산출물 | 포함할 실제 내용 |
|---|---|
| 이용약관 | 운영 주체/주소/연락처, 무료 범위, 당사자 역할, 허위 공고/괴롭힘 제재, 계정 종료, 분쟁/변경 공지 |
| 개인정보처리방침 | 로그인 정보·표시 이름·지원/메시지·신고의 수집 목적, 고용주 공유 범위, Supabase/Vercel/Resend, cookie, 보관·삭제, 문의·변경·적용일 |
| 공고 정책 | CA 근무지, 정확한 pay scale/단위·업무·일정, 직무상 언어 요건, 사기·차별·불법 임금 표현, 검토와 중지/이의신청 |
| 근무자격 안내 | 개인 자격을 플랫폼이 판단하지 않음, 일반 USCIS/DSO 안내, 개인 비자 서류 수집 없음 |

한국어 본문과 영어 주요 안내를 준비하고 실제 법적 효력/우선 언어는 검토 결과에 맞춘다. CCPA 적용 여부, CalOPPA, 구인광고/제3자 책임, 이용자 연령 및 CA 채용 기록 보존을 검토 의제로 준다. 이 외부 검토가 미완료면 공개 날짜를 확정하지 않는다.

- [x] **C3.3 지역/업종별 임금 검토 절차를 넣는다.**

모든 공고에 급여 범위를 받는 것은 플랫폼 정책이다. 법이 모든 규모 사업장에 동일하게 적용된다고 설명하지 않는다. CA 기본 최저임금만 통과하면 승인하는 자동 판정은 만들지 않는다. 도시/카운티, fast-food/healthcare 등 적용 가능 업종, tips 포함 여부, 무급 교육·분류 문제를 대표가 공식 자료로 확인한다.

참고: [CA Pay Scale FAQ](https://www.dir.ca.gov/dlse/california_equal_pay_act.htm), [CA Minimum Wage](https://dir.ca.gov/dlse/minimum_wage.htm), [EEOC](https://www.eeoc.gov/national-origin-discrimination).

- [x] **C3.4 정책 게시와 버전/시각 저장을 연결한다.**

~~~sql
alter table public.profiles
  add column terms_version text,
  add column terms_accepted_at timestamptz,
  add column privacy_notice_version text;
alter table public.jobs
  add column posting_policy_version text,
  add column posting_policy_acknowledged_at timestamptz;
~~~

신규 사용자/공고 쓰기에는 현행 버전 확인을 요구한다. 기존 사용자에게는 다음 해당 행위 때 확인을 받고 동의한 것으로 일괄 backfill하지 않는다. UI 동의 없이 form 제출, 직접 API 우회, 과거 버전, 시각 위조를 검사한다. DB trigger는 클라이언트의 수신 시각 대신 now()로 기록한다.

- [ ] **C3.5 개인정보 요청을 수동으로 끝까지 리허설한다.**

> 분리 상태: 로컬 Auth/DB/export/suppression·empty toy 삭제와 linked cascade rollback 완료. 실제 support intake/본인확인 회신·보존 결정·선택한 linked-record 삭제 전략/hosted 리허설은 UNVERIFIED.

지원 이메일 접수→요청 ID 기록→기존 검증 계정으로 본인 확인→대상/보존 예외 확인→열람본 준비 또는 삭제 범위 설명→처리→완료 안내→실행 증거 보관 순서를 정한다.

삭제 전에는 profiles→companies→jobs→다른 사람의 applications/messages로 이어지는 CASCADE 영향을 반드시 확인한다. 사용자의 계정 삭제가 타인의 지원 이력을 예기치 않게 없애지 않도록, 검토된 보존 정책에 따라 필요한 연결/보관 구조를 먼저 정리한다. 운영 DB에서 단순 auth user delete를 바로 실행하는 안내를 제공하지 않는다.

~~~sql
-- 실제 삭제 전 영향 확인 query. 대상 UUID는 안전한 parameter로 바인딩한다.
select c.id as company_id, count(distinct j.id) as jobs,
       count(distinct a.id) as applications
from public.companies c
left join public.jobs j on j.company_id = c.id
left join public.applications a on a.job_id = j.id
where c.owner_id = $1
group by c.id;
~~~

법률 보존 예외/보관 기간 확정 후 disposable staging 계정으로 실제 열람·삭제·worker 수신 차단까지 검증한다. 제품 내 즉시 삭제 버튼을 약속하지 않고 실제 제공하는 지원 절차를 게시한다.

- [x] **C3.6 정책 내용/흐름을 확인하고 커밋한다.**

~~~bash
npm test -- tests/policy-acknowledgements.test.ts tests/smoke-public-pages.test.ts
npm run test:db
git add -p
git commit -m "feat: publish launch policies and record acknowledgements"
~~~

운영 주체/실제 support 주소/적용일/보관 기준이 확정되지 않은 문서는 “검토 초안”으로만 둔다. 테스트 통과를 외부 법률 검토의 대체로 삼지 않는다.

### Task C4: 모바일 완주, 오류 복구, SEO와 실제 운영 지표

> 2026-09-11 D3 실제 상태: [실제 C4 browser/Safari 범위](../../launch-evidence/browser-qa.md), [D2 root/global recovery·injected safe-area](../../launch-evidence/release-candidate.md), [CA cohort 정확한 정의](../../OPERATIONAL_HEALTH.md#ca-publication-signals-c4).

**예상:** 8~12시간. **산출:** 모바일 사용자가 실제로 지원/답변하고 대표가 효과를 측정함.

**Files:**
- Create src/app/error.tsx, global-error.tsx, not-found.tsx, src/lib/jobs/structured-data.ts, src/lib/db/sitemap.ts.
- Modify src/app/sitemap.ts, robots.ts, src/app/(public)/jobs/[id]/page.tsx, src/components/SiteHeader.tsx, MobileBottomNav.tsx.
- Modify src/lib/db/admin-analytics.ts, src/app/admin/analytics/page.tsx, docs/OPERATIONAL_HEALTH.md.
- Create tests/structured-data.test.ts, tests/e2e/launch-journey.spec.ts, docs/launch-evidence/browser-qa.md.

**Interfaces:** buildJobPosting(job:Job & {expiresAt:string}):Record<string,unknown>. getSitemapJobs():Promise<Array<{id:string;updatedAt:string}>>. admin analytics에 cohortCount/appliedWithin7Days/medianFirstEmployerReplyHours를 추가한다.

- [ ] **C4.1 대표 사용자 3개의 전체 여정을 브라우저 검사로 고정한다.**

> 분리 상태: 390/1440 Chromium 세 역할 완주/키보드/중복/네트워크 회귀 완료. 실제 physical iOS full journey는 UNVERIFIED; native desktop Safari bounded QA와 구분.

seeker: 로그인→프로필→CA 검색→지원→대화→철회. employer: 권한신청→회사→공고→검토 결과→지원자 답장→마감. admin: MFA→승인→신고→중지→audit 확인.

~~~ts
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/jobs");
await expect(page.getByRole("heading", { name: "공고 둘러보기", exact: true })).toBeVisible();
await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
~~~

상태별 빈 화면·오류 화면·pending 버튼·중복 제출·긴 한국어 제목·키보드 focus를 확인한다. iOS Safari는 실제 기기/브라우저에서 수동 확인하고 Chromium 통과로 대신하지 않는다.

- [x] **C4.2 Next 오류 복구 UI를 추가한다.**

~~~tsx
"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main role="alert">
    <h1>잠시 불러오지 못했습니다.</h1>
    <p>저장 여부는 내 지원 현황에서 확인할 수 있습니다.</p>
    <button onClick={reset}>다시 시도</button>
    <a href="/dashboard/applications">내 지원 현황</a>
  </main>;
}
~~~

global-error는 자체 html/body가 필요하다. 실제 예외 세부/이메일/키를 출력하지 않는다. 에러 시 mock 목록을 보여주지 않는다. public header에는 항상 로그인으로 보이는 문제를 정리하고 기존 AccountBar/대시보드 링크를 재사용한다.

- [x] **C4.3 공개 중인 공고만 검색엔진에 제공한다.**

~~~ts
const unitText = { hour: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR" } as const;
const salary = {
  "@type": "MonetaryAmount", currency: "USD",
  value: { "@type": "QuantitativeValue", minValue: job.payMin,
    maxValue: job.payMax, unitText: unitText[job.payUnit] },
};
~~~

JobPosting에 title/description/datePosted/validThrough/hiringOrganization/jobLocation/baseSalary를 포함하고 화면에 없는 사실을 생성하지 않는다. JSON script는 JSON.stringify(result).replace(/</g, "\\u003c")로 직렬화한다.

사이트맵은 동적으로 is_job_open을 만족하는 공고를 조회한다. DB 기본 1,000행 상한에서 끊기지 않도록 1,000개씩 range 조회하고 1,001행 fixture로 검증한다. 50,000 URL 규모 전에 sitemap 분할을 도입한다. 삭제/만료는 결과에서 제외하며 미완성 필터 조합용 SEO 페이지를 대량 생성하지 않는다.

기준 문서: [Google JobPosting](https://developers.google.com/search/docs/appearance/structured-data/job-posting), 설치된 Next sitemap/metadata 문서. Google의 노출이나 채용 검색 등록을 보장한다고 표현하지 않는다.

- [x] **C4.4 데이터가 있는 범위에서 성과를 계산한다.**

주요 지표는 “게시 후 7일 내 철회·스팸 제외 지원이 1개 이상 발생한 공고 비율”이다. 최근 게시로 관찰 기간이 부족한 공고는 분모에서 제외한다. 첫 고용주 답장은 messages의 실제 sender/소유 관계로 구하고 응답 없는 건의 수를 별도로 표시한다. offered는 실제 채용 완료와 다르게 표시한다.

~~~sql
select count(*) as mature_jobs
from public.jobs
where posted_at >= now() - interval '28 days'
  and posted_at <= now() - interval '7 days';
~~~

동일 모집의 재게시 기준은 최신 posted_at으로 통일하고 대시보드에 설명한다. 지원 수는 해당 posted_at~posted_at+7일의 applications만 센다. 상태가 withdrawn이거나 정지된 스팸 주체의 지원은 제외한다. 방문 기반 전환율은 방문 수집을 추가하기 전에는 계산하지 않는다.

- [ ] **C4.5 검사·수동 QA 증거를 남기고 커밋한다.**

> 분리 상태: 로컬 자동/수동 QA·일반 build·커밋 완료. 실제 build:release는 설정 누락으로 차단; 공개 domain/Search Console·실기기/인증 native Safari 전체 여정·LCP/CLS·실메일 복귀는 UNVERIFIED.

~~~bash
npm test -- tests/structured-data.test.ts tests/seo.test.ts tests/admin-analytics.test.ts
npm run test:e2e -- tests/e2e/launch-journey.spec.ts
npm run build:release
git add -p
git commit -m "feat: complete mobile launch experience and marketplace signals"
~~~

공개 도메인 Google Search Console 검증과 URL 검사, 실제 기기의 390px/1440px 확인, failed network 복구, 폼 label/키보드 접근, 이메일 링크 복귀 결과를 browser-qa.md에 남긴다. 성능 목표는 모바일 LCP 2.5초 이내·CLS 0.1 이하를 초기 목표로 잡고 실제 측정 장비/네트워크도 기록한다.

## 완료 기준

C1~C4 완료 후 대표가 실제 운영 리허설을 수행한다. 미전송 이메일, 신고 중지 실패, 정책 초안, 타인 데이터 접근 또는 복원 미검증은 공개 출시를 막는다. 최종 실제 배포/고객 공개 순서는 전체 계획 D1~D3를 따른다.
