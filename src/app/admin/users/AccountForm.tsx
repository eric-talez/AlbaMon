"use client";
import { useActionState } from "react";
import { suspendAccount, restoreAccount, type AccountActionState } from "./actions";
const initial: AccountActionState = { status: "idle", message: "" };
export function AccountForm({ userId, suspended, self }: { userId: string; suspended: boolean; self: boolean }) {
  const [state, action, pending] = useActionState(suspended ? restoreAccount : suspendAccount, initial);
  return <form action={action} className="mt-3 space-y-3">
    <input type="hidden" name="userId" value={userId} />
    <label className="block text-sm">처리 사유 / Reason (필수)
      <textarea name="reason" required minLength={1} maxLength={500} disabled={self || pending} className="mt-1 block w-full rounded border border-border p-2" />
    </label>
    <button disabled={self || pending} className="rounded bg-brand px-4 py-2 text-brand-foreground disabled:opacity-50">{suspended ? "정지 해제 / Restore" : "계정 정지 / Suspend"}</button>
    {state.message && <p role={state.status === "success" ? "status" : "alert"} className="text-sm">{state.message}</p>}
  </form>;
}
