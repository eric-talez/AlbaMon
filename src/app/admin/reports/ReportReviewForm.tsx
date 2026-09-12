"use client";

import { useActionState } from "react";
import { reviewReport, pauseAndReviewReport, type ReportReviewState } from "./actions";

const INITIAL_STATE: ReportReviewState = { status: "idle", message: "" };

export function ReportReviewForm({
  reportId,
  disabled,
  jobUpdatedAt,
  canPause,
}: {
  reportId: string;
  disabled: boolean;
  jobUpdatedAt: string | null;
  canPause: boolean;
}) {
  const [state, formAction, pending] = useActionState(reviewReport, INITIAL_STATE);

  const [pauseState, pauseAction, pausing] = useActionState(pauseAndReviewReport, INITIAL_STATE);
  return (
    <div>
    {canPause && jobUpdatedAt && <form action={pauseAction} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="expectedUpdatedAt" value={jobUpdatedAt} />
      <label className="block text-sm">공고 중지 사유 / Pause reason
        <textarea name="reason" required maxLength={500} className="mt-1 block w-full rounded border border-border p-2" />
      </label>
      <button disabled={disabled || pausing} className="mt-3 rounded bg-brand px-4 py-2 text-brand-foreground">공고 중지 후 검토 완료 / Pause and review</button>
      {pauseState.message && <p role={pauseState.status === "success" ? "status" : "alert"}>{pauseState.message}</p>}
    </form>}
    <form action={formAction} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="reportId" value={reportId} />
      {state.message ? (
        <p
          role={state.status === "success" ? "status" : "alert"}
          className={state.status === "success" ? "text-sm text-brand" : "text-sm text-danger"}
        >
          {state.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="submit"
          name="status"
          value="reviewed"
          disabled={disabled || pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          검토 완료 (상태만)
        </button>
        <button
          type="submit"
          name="status"
          value="dismissed"
          disabled={disabled || pending}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          기각
        </button>
      </div>
    </form>
    <p className="mt-2 text-xs text-muted">검토 완료·기각만으로 공고는 중지되지 않습니다. 회사 확인과 공고 위험 검토는 별개입니다.</p>
    </div>
  );
}
