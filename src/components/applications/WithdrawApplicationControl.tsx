"use client";

import { useActionState } from "react";
import type { ApplicationStatusFormState } from "@/lib/applications/status-action";

export function WithdrawApplicationControl({ applicationId, expectedUpdatedAt, withdrawAction }: {
  applicationId: string;
  expectedUpdatedAt: string;
  withdrawAction: (previousState: ApplicationStatusFormState, formData: FormData) => Promise<ApplicationStatusFormState>;
}) {
  const [state, action, pending] = useActionState(withdrawAction, { status: "idle" as const, message: "" });
  return <form action={action} className="mt-4 border-t border-border pt-4">
    <input type="hidden" name="applicationId" value={applicationId} />
    <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
    <p className="text-xs text-muted">철회 후에도 지원 내역과 대화가 보존됩니다. / Your history and messages remain available.</p>
    <button type="submit" disabled={pending} className="mt-2 rounded-full border border-border px-4 py-2 text-sm disabled:opacity-60">
      {pending ? "철회 중…" : "지원 철회 / Withdraw"}
    </button>
    {state.message ? <p className="mt-2 text-sm" role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
