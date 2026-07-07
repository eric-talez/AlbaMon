"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { reviewEmployerAccessRequest } from "@/lib/db/employer-access-requests";

export interface EmployerRequestReviewState {
  status: "idle" | "success" | "conflict" | "error";
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewEmployerRequest(
  _previousState: EmployerRequestReviewState,
  formData: FormData,
): Promise<EmployerRequestReviewState> {
  await requireRole("admin", "/admin/employer-requests");

  const requestId = formData.get("requestId");
  const decision = formData.get("decision");
  if (
    typeof requestId !== "string" ||
    !UUID_PATTERN.test(requestId) ||
    (decision !== "approved" && decision !== "rejected")
  ) {
    return { status: "error", message: "올바른 고용주 권한 처리 요청이 아닙니다." };
  }

  const result = await reviewEmployerAccessRequest(requestId, decision);
  if (result.status === "ok") {
    revalidatePath("/admin");
    revalidatePath("/admin/employer-requests");
    return {
      status: "success",
      message:
        decision === "approved"
          ? "요청을 승인했습니다. 요청자 계정이 고용주 권한으로 전환되었습니다."
          : "요청을 반려했습니다. 요청자 권한은 변경되지 않았습니다.",
    };
  }
  if (result.status === "conflict") {
    revalidatePath("/admin/employer-requests");
    return {
      status: "conflict",
      message: "이미 처리되었거나 검토 대기 상태가 아닌 요청입니다.",
    };
  }
  if (result.status === "not_allowed") {
    return { status: "error", message: "요청을 처리할 권한이 없습니다." };
  }
  return {
    status: "error",
    message:
      result.status === "unavailable"
        ? "Supabase가 연결된 환경에서만 고용주 권한 요청을 처리할 수 있습니다."
        : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
