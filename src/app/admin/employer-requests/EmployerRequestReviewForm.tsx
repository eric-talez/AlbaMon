"use client";

import { useActionState } from "react";
import { reviewEmployerRequest, type EmployerRequestReviewState } from "./actions";

const INITIAL_STATE: EmployerRequestReviewState = { status: "idle", message: "" };

export function EmployerRequestReviewForm({
  requestId,
  disabled,
}: {
  requestId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    reviewEmployerRequest,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-4 border-t border-border pt-4">
      <input type="hidden" name="requestId" value={requestId} />
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
          name="decision"
          value="approved"
          disabled={disabled || pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          승인 (고용주 전환)
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={disabled || pending}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          반려
        </button>
      </div>
    </form>
  );
}
