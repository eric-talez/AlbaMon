"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { updateReportStatus } from "@/lib/db/reports";

export interface ReportReviewState {
  status: "idle" | "success" | "conflict" | "error";
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function reviewReport(
  _previousState: ReportReviewState,
  formData: FormData,
): Promise<ReportReviewState> {
  await requireRole("admin", "/admin/reports");

  const reportId = formData.get("reportId");
  const status = formData.get("status");
  if (
    typeof reportId !== "string" ||
    !UUID_PATTERN.test(reportId) ||
    (status !== "reviewed" && status !== "dismissed")
  ) {
    return { status: "error", message: "올바른 신고 처리 요청이 아닙니다." };
  }

  const result = await updateReportStatus(reportId, status);
  if (result.status === "updated") {
    revalidatePath("/admin");
    revalidatePath("/admin/reports");
    return {
      status: "success",
      message: status === "reviewed" ? "신고를 검토 완료로 표시했습니다." : "신고를 기각했습니다.",
    };
  }
  if (result.status === "conflict") {
    revalidatePath("/admin/reports");
    return {
      status: "conflict",
      message: "이미 처리되었거나 열려 있지 않은 신고입니다.",
    };
  }
  return {
    status: "error",
    message: result.status === "unavailable"
      ? "Supabase가 연결된 환경에서만 신고를 처리할 수 있습니다."
      : "신고 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
