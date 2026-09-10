"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { updateReportStatus, pauseReportedJob } from "@/lib/db/reports";

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
      message: status === "reviewed" ? "신고를 검토 완료로 표시했습니다. 이 처리만으로 공고는 중지되지 않습니다." : "신고를 기각했습니다.",
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

export async function pauseAndReviewReport(_state: ReportReviewState, formData: FormData): Promise<ReportReviewState> {
  await requireRole("admin", "/admin/reports");
  const reportId = formData.get("reportId"), revision = formData.get("expectedUpdatedAt"), reason = formData.get("reason");
  if (typeof reportId !== "string" || !UUID_PATTERN.test(reportId) || typeof revision !== "string" || !Number.isFinite(Date.parse(revision))
      || typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
    return { status: "error", message: "공고 상태와 1~500자의 중지 사유를 확인해 주세요." };
  }
  const result = await pauseReportedJob(reportId, revision, reason.trim());
  for (const path of ["/admin", "/admin/reports", "/admin/jobs", "/jobs", "/employer/jobs"]) revalidatePath(path);
  if (result.status === "updated") return { status: "success", message: "공고를 중지하고 사유를 기록한 뒤 신고를 검토 완료로 표시했습니다." };
  return { status: result.status === "conflict" ? "conflict" : "error", message: "공고 또는 신고 상태를 다시 확인해 주세요. 중지가 이미 적용되었을 수 있습니다. 새로고침 후 처리해 주세요." };
}
