"use client";

import { useActionState } from "react";
import {
  submitApplication,
  type ApplicationFormState,
} from "./actions";

const INITIAL_STATE: ApplicationFormState = { status: "idle", message: "" };

export function ApplicationForm({ jobId }: { jobId: string }) {
  const action = submitApplication.bind(null, jobId);
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const confirmed = state.status === "success" || state.status === "duplicate";

  if (confirmed) {
    return (
      <div
        role="status"
        className="rounded-xl border border-brand/30 bg-brand-soft p-5 text-sm text-brand"
      >
        <p className="font-semibold">{state.message}</p>
        <p className="mt-2 text-xs">
          지원 내역 관리는 다음 지원자 대시보드 슬라이스에서 제공됩니다.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="coverNote">
        지원 메모 <span className="font-normal text-muted">(선택)</span>
      </label>
      <textarea
        id="coverNote"
        name="coverNote"
        rows={6}
        maxLength={1_000}
        placeholder="간단한 소개나 지원 동기를 작성해 주세요."
        className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand"
      />
      <p className="text-xs text-muted">최대 1,000자</p>

      {state.message ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-brand px-6 font-medium text-brand-foreground transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "지원 처리 중…" : "지원하기 (Apply)"}
      </button>
    </form>
  );
}
