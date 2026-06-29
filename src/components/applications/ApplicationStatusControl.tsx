"use client";

import { useActionState } from "react";
import type { ApplicationStatusFormState } from "@/lib/applications/status-action";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/types";

const INITIAL_STATE: ApplicationStatusFormState = { status: "idle", message: "" };

/**
 * Employer-facing control to move one application through its status workflow.
 * Submits to the employer status server action; success/error feedback is shown
 * inline and is mobile-friendly (the select + button stack on narrow screens).
 */
export function ApplicationStatusControl({
  applicationId,
  currentStatus,
  updateAction,
}: {
  applicationId: string;
  currentStatus: string;
  updateAction: (
    previousState: ApplicationStatusFormState,
    formData: FormData,
  ) => Promise<ApplicationStatusFormState>;
}) {
  const [state, formAction, pending] = useActionState(updateAction, INITIAL_STATE);

  // Fall back to the seeker's initial state if the stored value is unknown.
  const selectedStatus = (APPLICATION_STATUSES as readonly string[]).includes(
    currentStatus,
  )
    ? (currentStatus as ApplicationStatus)
    : "submitted";
  const selectId = `application-status-${applicationId}`;

  return (
    <form
      action={formAction}
      className="mt-4 border-t border-border pt-4"
      aria-label="지원 상태 변경"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <label htmlFor={selectId} className="text-sm font-semibold">
        지원 상태 변경
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          id={selectId}
          name="status"
          defaultValue={selectedStatus}
          className="w-full rounded-xl border border-border bg-background p-2 text-sm outline-none focus:border-brand sm:w-auto"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {APPLICATION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "변경 중…" : "상태 변경"}
        </button>
      </div>
      {state.message ? (
        <p
          role={state.status === "success" ? "status" : "alert"}
          className={
            state.status === "success"
              ? "mt-3 text-sm text-brand"
              : "mt-3 text-sm text-danger"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
