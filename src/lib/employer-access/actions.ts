import "server-only";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { createEmployerAccessRequest } from "@/lib/db/employer-access-requests";
import { parseEmployerAccessRequestForm } from "@/lib/employer-access/validation";
import { enforceUserPolicy } from "@/lib/rate-limit/service";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";
import { rateLimitedResult } from "@/lib/rate-limit/types";
import type { RateLimitedResult } from "@/lib/rate-limit/types";

export type EmployerAccessRequestFormState =
  | { status: "idle" | "success" | "duplicate_pending" | "error"; message: string }
  | RateLimitedResult;

/**
 * Submit an employer access request for the signed-in user. Only seekers may
 * file one — employers and admins already have access — and the request only
 * queues an admin review: it never changes the caller's role by itself.
 */
export async function submitEmployerAccessRequestForUser(
  formData: FormData,
): Promise<EmployerAccessRequestFormState> {
  const user = await requireUser("/employer/request-access");
  if (user.role !== "seeker") {
    return {
      status: "error",
      message: "이미 고용주 기능을 사용할 수 있는 계정입니다. 새 요청이 필요하지 않습니다.",
    };
  }

  const parsed = parseEmployerAccessRequestForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const limit = await enforceUserPolicy(
    RATE_LIMIT_POLICIES.employerAccessRequest,
    user.id,
  );
  if (!limit.allowed) return rateLimitedResult(limit.retryAfterSeconds);

  const result = await createEmployerAccessRequest(user.id, parsed.value);

  if (result.status === "ok") {
    revalidatePath("/admin");
    revalidatePath("/admin/employer-requests");
    revalidatePath("/employer/request-access");
    return {
      status: "success",
      message:
        "고용주 권한 요청을 접수했습니다. 관리자 검토가 끝나면 공고 등록을 시작할 수 있습니다. 승인이 보장되지는 않습니다.",
    };
  }
  if (result.status === "duplicate_pending") {
    return {
      status: "duplicate_pending",
      message: "이미 검토 대기 중인 요청이 있습니다. 관리자 검토 결과를 기다려 주세요.",
    };
  }
  if (result.status === "unavailable") {
    return {
      status: "error",
      message: "고용주 권한 요청은 Supabase가 연결된 환경에서 사용할 수 있습니다.",
    };
  }
  if (result.status === "not_allowed") {
    return {
      status: "error",
      message: "현재 계정 상태에서는 고용주 권한을 요청할 수 없습니다.",
    };
  }
  return {
    status: "error",
    message: "요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
