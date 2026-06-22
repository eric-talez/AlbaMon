"use client";

import Link from "next/link";
import { useActionState } from "react";
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
import { submitEmployerJob, type JobFormState } from "./actions";

const INITIAL_STATE: JobFormState = { status: "idle", message: "" };
const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand";

export function JobForm({ companies }: { companies: EmployerCompany[] }) {
  const [state, formAction, pending] = useActionState(submitEmployerJob, INITIAL_STATE);

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
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        회사
        <select className={inputClass} name="companyId" required defaultValue={companies[0]?.id}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">
        공고 제목
        <input className={inputClass} name="title" required maxLength={120} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          직종
          <select className={inputClass} name="category" required defaultValue="">
            <option value="" disabled>선택</option>
            {JOB_CATEGORIES.map((value) => <option key={value} value={value}>{JOB_CATEGORY_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          고용 형태
          <select className={inputClass} name="jobType" required defaultValue="">
            <option value="" disabled>선택</option>
            {JOB_TYPES.map((value) => <option key={value} value={value}>{JOB_TYPE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">도시<input className={inputClass} name="city" required maxLength={100} /></label>
        <label className="block text-sm font-medium">주(State)<input className={inputClass} name="state" required maxLength={2} defaultValue="CA" /></label>
        <label className="block text-sm font-medium">
          주소 공개 방식
          <select className={inputClass} name="addressDisplayMode" required defaultValue="city_only">
            <option value="city_only">도시만 공개</option>
            <option value="full">표시 주소 공개</option>
          </select>
        </label>
        <label className="block text-sm font-medium">표시 주소 <span className="font-normal text-muted">(전체 공개 선택 시 필수)</span><input className={inputClass} name="addressDisplay" maxLength={200} /></label>
        <label className="block text-sm font-medium">최소 급여<input className={inputClass} name="payMin" required inputMode="decimal" /></label>
        <label className="block text-sm font-medium">최대 급여<input className={inputClass} name="payMax" required inputMode="decimal" /></label>
        <label className="block text-sm font-medium">
          급여 단위
          <select className={inputClass} name="payUnit" required defaultValue="hour">
            {PAY_UNITS.map((value) => <option key={value} value={value}>{PAY_UNIT_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input type="checkbox" name="tipsAvailable" /> 팁 별도 제공
        </label>
        <label className="block text-sm font-medium">근무 요일<input className={inputClass} name="scheduleDays" required maxLength={200} placeholder="예: 월–금" /></label>
        <label className="block text-sm font-medium">근무 시간<input className={inputClass} name="scheduleTimeRange" required maxLength={200} placeholder="예: 09:00–17:00" /></label>
      </div>
      <label className="block text-sm font-medium">
        언어 요건
        <select className={inputClass} name="languageRequirement" required defaultValue="">
          <option value="" disabled>선택</option>
          {LANGUAGE_REQUIREMENTS.map((value) => <option key={value} value={value}>{LANGUAGE_REQUIREMENT_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">상세 설명<textarea className={inputClass} name="description" required rows={8} maxLength={5_000} /></label>
      <label className="block text-sm font-medium">담당 업무 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} name="responsibilities" rows={4} /></label>
      <label className="block text-sm font-medium">자격 요건 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} name="requirements" rows={4} /></label>
      <label className="block text-sm font-medium">복리후생 <span className="font-normal text-muted">(선택, 한 줄에 하나)</span><textarea className={inputClass} name="benefits" rows={4} /></label>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 dark:border-amber-900/50 dark:bg-amber-950/20">
        국적 제한, 비자 신분 선호, 세금 회피성 현금 지급 표현은 등록할 수 없습니다. 언어 요건은 실제 직무 필요에 근거해야 합니다.
      </div>
      <button type="submit" disabled={pending} className="h-12 w-full rounded-full bg-brand px-6 font-medium text-brand-foreground disabled:cursor-wait disabled:opacity-60">
        {pending ? "제출 중…" : "검토 요청으로 제출"}
      </button>
    </form>
  );
}
