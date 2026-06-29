"use client";

import { useActionState } from "react";
import { reviewReport, type ReportReviewState } from "./actions";

const INITIAL_STATE: ReportReviewState = { status: "idle", message: "" };

export function ReportReviewForm({
  reportId,
  disabled,
}: {
  reportId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(reviewReport, INITIAL_STATE);

  return (
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
          검토 완료
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
  );
}
