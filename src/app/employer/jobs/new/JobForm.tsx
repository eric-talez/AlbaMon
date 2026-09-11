"use client";

import { POSTING_POLICY_VERSION } from "@/lib/policies";

import Link from "next/link";
import { useActionState } from "react";
import type { JobRow } from "@/lib/db/types";
import { saveEmployerJob } from "../[id]/edit/actions";
import type { EmployerCompany } from "@/lib/db/companies";
import {
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  LANGUAGE_REQUIREMENTS,
  LANGUAGE_REQUIREMENT_LABELS,
  PAY_UNITS,
  PAY_UNIT_LABELS,
} from "@/lib/types";
import { WorkAuthorizationDisclaimer } from "@/components/WorkAuthorizationDisclaimer";
import { submitEmployerJob, type JobFormState } from "./actions";

const INITIAL_STATE: JobFormState = { status: "idle", message: "" };
const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand";

export function JobForm({ companies, job }: { companies: EmployerCompany[]; job?: JobRow }) {
  const [state, formAction, pending] = useActionState(job ? saveEmployerJob : submitEmployerJob, INITIAL_STATE);

  if (state.status === "success") {
    return (
      <section className="mt-6 rounded-xl border border-brand/30 bg-brand-soft p-5" role="status">
        <h2 className="font-semibold text-brand">{state.message}</h2>
        <p className="mt-2 text-sm text-foreground/80">관리자 승인 전에는 공개 채용 목록에 표시되지 않습니다.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
          <Link href="/employer/jobs" className="text-brand hover:underline">내 공고 보기</Link>
          <Link href="/employer/jobs/new" className="text-brand hover:underline">다른 공고 등록</Link>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5 rounded-xl border border-border bg-surface p-5">
      {state.message ? (
        <p role="alert" aria-live="polite" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      {job ? <><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="expectedUpdatedAt" value={job.updated_at} /><p>대상: {job.title}. 저장하면 공개가 중지되고 재심사가 시작됩니다.</p></> : <label className="block text-sm font-medium" htmlFor="job-companyId">
        회사
        <select className={inputClass} id="job-companyId" name="companyId" required defaultValue={companies[0]?.id}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </label>}
      <label className="block text-sm font-medium" htmlFor="job-title">
        공고 제목
        <input className={inputClass} id="job-title" name="title" defaultValue={job?.title ?? ""} required maxLength={120} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium" htmlFor="job-category">
          직종
          <select className={inputClass} id="job-category" name="category" required defaultValue={job?.category ?? ""}>
            <option value="" disabled>선택</option>
            {JOB_CATEGORIES.map((value) => <option key={value} value={value}>{JOB_CATEGORY_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="job-jobType">
          고용 형태
          <select className={inputClass} id="job-jobType" name="jobType" required defaultValue={job?.job_type ?? ""}>
            <option value="" disabled>선택</option>
            {JOB_TYPES.map((value) => <option key={value} value={value}>{JOB_TYPE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="job-city">도시<input className={inputClass} id="job-city" name="city" defaultValue={job?.city ?? ""} required maxLength={100} placeholder="예: Los Angeles" /></label>
        <label className="block text-sm font-medium" htmlFor="job-state">주(State)<input className={inputClass} id="job-state" name="state" required readOnly value="CA" /></label>
        <label className="block text-sm font-medium" htmlFor="job-addressDisplayMode">
          주소 공개 방식
          <select className={inputClass} id="job-addressDisplayMode" name="addressDisplayMode" required defaultValue={job?.address_display_mode ?? "city_only"}>
            <option value="city_only">도시만 공개</option>
            <option value="full">표시 주소 공개</option>
          </select>
        </label>
        <label className="block text-sm font-medium" htmlFor="job-addressDisplay">표시 주소 <span className="font-normal text-muted">(전체 공개 선택 시 필수)</span><input className={inputClass} id="job-addressDisplay" name="addressDisplay" defaultValue={job?.address_display ?? ""} maxLength={200} /></label>
        <label className="block text-sm font-medium" htmlFor="job-payMin">최소 급여<input className={inputClass} id="job-payMin" name="payMin" defaultValue={job?.pay_min ?? ""} required type="number" min="0.01" step="0.01" inputMode="decimal" /></label>
        <label className="block text-sm font-medium" htmlFor="job-payMax">최대 급여<input className={inputClass} id="job-payMax" name="payMax" defaultValue={job?.pay_max ?? ""} required type="number" min="0.01" step="0.01" inputMode="decimal" /></label>
        <label className="block text-sm font-medium" htmlFor="job-payUnit">
          급여 단위
          <select className={inputClass} id="job-payUnit" name="payUnit" required defaultValue={job?.pay_unit ?? "hour"}>
            {PAY_UNITS.map((value) => <option key={value} value={value}>{PAY_UNIT_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium" htmlFor="job-tipsAvailable">
          <input type="checkbox" id="job-tipsAvailable" name="tipsAvailable" defaultChecked={job?.tips_available} /> 팁 별도 제공
        </label>
        <label className="block text-sm font-medium" htmlFor="job-scheduleDays">근무 요일<input className={inputClass} id="job-scheduleDays" name="scheduleDays" defaultValue={job?.schedule_days ?? ""} required maxLength={200} placeholder="예: 월–금" /></label>
        <label className="block text-sm font-medium" htmlFor="job-scheduleTimeRange">근무 시간<input className={inputClass} id="job-scheduleTimeRange" name="scheduleTimeRange" defaultValue={job?.schedule_time_range ?? ""} required maxLength={200} placeholder="예: 09:00–17:00" /></label>
      </div>
      <label className="block text-sm font-medium" htmlFor="job-languageRequirement">
        언어 요건
        <select className={inputClass} id="job-languageRequirement" name="languageRequirement" required defaultValue={job?.language_requirement ?? ""}>
          <option value="" disabled>선택</option>
          {LANGUAGE_REQUIREMENTS.map((value) => <option key={value} value={value}>{LANGUAGE_REQUIREMENT_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium" htmlFor="job-description">상세 설명<textarea className={inputClass} id="job-description" name="description" defaultValue={job?.description ?? ""} required rows={8} maxLength={5_000} /></label>
      <label className="block text-sm font-medium" htmlFor="job-responsibilities">담당 업무 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} id="job-responsibilities" name="responsibilities" defaultValue={job?.responsibilities?.join("\n") ?? ""} rows={4} /></label>
      <label className="block text-sm font-medium" htmlFor="job-requirements">자격 요건 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} id="job-requirements" name="requirements" defaultValue={job?.requirements?.join("\n") ?? ""} rows={4} /></label>
      <label className="block text-sm font-medium" htmlFor="job-benefits">복리후생 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} id="job-benefits" name="benefits" defaultValue={job?.benefits?.join("\n") ?? ""} rows={4} /></label>

      <WorkAuthorizationDisclaimer />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        Employers are responsible for accurate job information and compliance
        with applicable wage, labor, tax, and work-authorization laws. K-Work US
        provides listing and communication tools only.
        <br />
        국적 제한, 비자 신분 선호, 세금 회피성 현금 지급 표현은 등록할 수 없습니다.
        언어 요건은 실제 직무 필요에 근거해야 합니다.
      </div>
      <label
        className="flex gap-3 rounded-lg border border-border bg-background p-3 text-sm leading-6"
        htmlFor="job-complianceAcknowledgement"
      >
        <input
          type="checkbox"
          id="job-complianceAcknowledgement"
          name="complianceAcknowledgement"
          required
          className="mt-1"
        />
        <input type="hidden" name="postingPolicyVersion" value={POSTING_POLICY_VERSION} />
        <span>
          <a href="/posting-policy" target="_blank" className="underline">공고 등록 정책 / Job posting policy</a>를 확인하고 동의합니다. (I acknowledge and agree.)
          I understand that I am responsible for accurate job information and
          compliance with applicable wage, labor, tax, and work-authorization
          laws.
          <span className="mt-1 block text-xs text-muted">
            공고 내용의 정확성과 임금, 노동, 세금, 근로 자격 관련 법규 준수 책임은
            고용주에게 있음을 이해합니다.
          </span>
        </span>
      </label>
      <button type="submit" disabled={pending} className="h-12 w-full rounded-full bg-brand px-6 font-medium text-brand-foreground disabled:cursor-wait disabled:opacity-60">
        {pending ? "제출 중…" : job ? "저장하고 재심사 / Save for review" : "검토 요청으로 제출"}
      </button>
    </form>
  );
}
