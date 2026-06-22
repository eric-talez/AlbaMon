"use client";

import { useActionState } from "react";
import {
  updateCompanyVerification,
  type CompanyVerificationState,
} from "./actions";

const INITIAL_STATE: CompanyVerificationState = { status: "idle", message: "" };

export function CompanyVerificationForm({
  companyId,
  isVerified,
}: {
  companyId: string;
  isVerified: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateCompanyVerification,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-5 border-t border-border pt-4">
      <input type="hidden" name="companyId" value={companyId} />
      {state.message ? (
        <p
          role={state.status === "success" ? "status" : "alert"}
          className={state.status === "success" ? "text-sm text-brand" : "text-sm text-danger"}
        >
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        name="verification"
        value={isVerified ? "unverify" : "verify"}
        disabled={pending}
        className={
          isVerified
            ? "mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
            : "mt-3 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        }
      >
        {isVerified ? "인증 해제" : "회사 인증"}
      </button>
    </form>
  );
}
