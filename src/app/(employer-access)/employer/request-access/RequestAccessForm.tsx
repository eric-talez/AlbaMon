"use client";

import { useActionState } from "react";
import type { EmployerAccessRequestFormState } from "@/lib/employer-access/actions";
import { submitEmployerAccessRequest } from "./actions";

const INITIAL_STATE: EmployerAccessRequestFormState = { status: "idle", message: "" };

const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand";

export function RequestAccessForm() {
  const [state, formAction, pending] = useActionState(
    submitEmployerAccessRequest,
    INITIAL_STATE,
  );
  const confirmed =
    state.status === "success" || state.status === "duplicate_pending";

  if (confirmed) {
    return (
      <section
        className="mt-6 rounded-xl border border-brand/30 bg-brand-soft p-5"
        role="status"
      >
        <h2 className="font-semibold">요청 접수 상태 / Request status</h2>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label htmlFor="businessName" className="text-sm font-semibold">
          업체명 / Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          required
          maxLength={200}
          className={FIELD_CLASS}
          placeholder="예: K-Work Cafe"
        />
      </div>

      <div>
        <label htmlFor="contactName" className="text-sm font-semibold">
          담당자 이름 / Contact name
        </label>
        <input
          id="contactName"
          name="contactName"
          type="text"
          required
          maxLength={120}
          className={FIELD_CLASS}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="text-sm font-semibold">
            전화번호 (선택) / Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={40}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label htmlFor="website" className="text-sm font-semibold">
            웹사이트 (선택) / Website (optional)
          </label>
          <input
            id="website"
            name="website"
            type="url"
            maxLength={2048}
            className={FIELD_CLASS}
            placeholder="https://"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="text-sm font-semibold">
            도시 / City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            required
            maxLength={100}
            className={FIELD_CLASS}
            placeholder="예: Los Angeles"
          />
        </div>
        <div>
          <label htmlFor="state" className="text-sm font-semibold">
            주 / State
          </label>
          <input
            id="state"
            name="state"
            type="text"
            required
            maxLength={2}
            defaultValue="CA"
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="reason" className="text-sm font-semibold">
          요청 사유 (선택) / Reason (optional)
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={4}
          maxLength={1000}
          className={FIELD_CLASS}
          placeholder="어떤 채용을 계획 중인지 간단히 알려 주세요. / Tell us briefly about your hiring plans."
        />
        <p className="mt-1 text-xs text-muted">최대 1,000자 / Max 1,000 characters</p>
      </div>

      {state.message ? (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "접수 중..." : "고용주 권한 요청 제출 / Submit request"}
      </button>
    </form>
  );
}
