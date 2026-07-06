"use client";

import { useActionState } from "react";
import type { ReportJobFormState } from "@/lib/reports/action";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/types";
import { submitJobReport } from "./actions";

const INITIAL_STATE: ReportJobFormState = { status: "idle", message: "" };

export function ReportJobForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(
    submitJobReport.bind(null, jobId),
    INITIAL_STATE,
  );
  const confirmed = state.status === "success" || state.status === "duplicate";

  if (confirmed) {
    return (
      <section
        className="mt-6 rounded-xl border border-brand/30 bg-brand-soft p-5"
        role="status"
      >
        <h2 className="font-semibold">신고 접수 상태</h2>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label htmlFor="reason" className="text-sm font-semibold">
          신고 사유 / Report reason
        </label>
        <select
          id="reason"
          name="reason"
          required
          className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand"
        >
          <option value="">선택해 주세요 / Select a reason</option>
          {REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {REPORT_REASON_LABELS[reason]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="details" className="text-sm font-semibold">
          상세 내용 / Details
        </label>
        <textarea
          id="details"
          name="details"
          rows={5}
          maxLength={1000}
          className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand"
          placeholder="문제가 되는 표현이나 상황을 간단히 적어 주세요. / Add a short note if helpful."
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
        {pending ? "접수 중..." : "신고 제출 / Submit report"}
      </button>
    </form>
  );
}
