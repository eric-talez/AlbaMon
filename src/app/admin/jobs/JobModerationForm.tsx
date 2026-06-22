"use client";

import { useActionState } from "react";
import { moderateJob, type JobModerationState } from "./actions";

const INITIAL_STATE: JobModerationState = { status: "idle", message: "" };

export function JobModerationForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(moderateJob, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-5 border-t border-border pt-4">
      <input type="hidden" name="jobId" value={jobId} />
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
          value="approve"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          승인
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="rounded-full border border-danger px-4 py-2 text-sm font-medium text-danger disabled:opacity-60"
        >
          반려
        </button>
      </div>
    </form>
  );
}
