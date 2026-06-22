"use client";

import { useActionState } from "react";
import type { EmployerCompany } from "@/lib/db/companies";
import { saveEmployerCompany, type CompanyFormState } from "./actions";

const INITIAL_STATE: CompanyFormState = { status: "idle", message: "" };

const inputClass =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand";

export function CompanyForm({ company }: { company: EmployerCompany | null }) {
  const [state, formAction, pending] = useActionState(saveEmployerCompany, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-5 rounded-xl border border-border bg-surface p-5">
      {company ? <input type="hidden" name="companyId" value={company.id} /> : null}
      {state.message ? (
        <p
          role={state.status === "success" ? "status" : "alert"}
          className={
            state.status === "success"
              ? "rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand"
              : "rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}

      <label className="block text-sm font-medium">
        회사명
        <input className={inputClass} name="name" required maxLength={120} defaultValue={company?.name ?? ""} />
      </label>
      <label className="block text-sm font-medium">
        회사 소개
        <textarea className={inputClass} name="description" required rows={5} maxLength={2_000} defaultValue={company?.description ?? ""} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          웹사이트 <span className="font-normal text-muted">(선택)</span>
          <input className={inputClass} name="website" type="url" maxLength={2_048} placeholder="https://example.com" defaultValue={company?.website ?? ""} />
        </label>
        <label className="block text-sm font-medium">
          전화번호 <span className="font-normal text-muted">(선택)</span>
          <input className={inputClass} name="phone" type="tel" maxLength={40} defaultValue={company?.phone ?? ""} />
        </label>
        <label className="block text-sm font-medium">
          도시
          <input className={inputClass} name="city" required maxLength={100} defaultValue={company?.city ?? ""} />
        </label>
        <label className="block text-sm font-medium">
          주(State)
          <input className={inputClass} name="state" required maxLength={2} defaultValue={company?.state ?? "CA"} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        표시 주소
        <input className={inputClass} name="addressDisplay" required maxLength={200} defaultValue={company?.addressDisplay ?? ""} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-brand px-6 font-medium text-brand-foreground transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "저장 중…" : company ? "회사 정보 수정" : "회사 등록"}
      </button>
    </form>
  );
}
