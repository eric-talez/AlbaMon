"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { moderatePendingJob } from "@/lib/db/admin-moderation";

export interface JobModerationState {
  status: "idle" | "success" | "conflict" | "error";
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function refreshAdminJobPaths(jobId?: string, includePublic = false): void {
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  for (const path of ["/", "/employer", "/employer/jobs", "/employer/applications", "/dashboard", "/dashboard/applications"]) revalidatePath(path);
  if (includePublic) {
    revalidatePath("/jobs");
    if (jobId) { revalidatePath(`/jobs/${jobId}`); revalidatePath(`/jobs/${jobId}/apply`); revalidatePath(`/employer/jobs/${jobId}/edit`); }
  }
}

export async function moderateJob(
  _previousState: JobModerationState,
  formData: FormData,
): Promise<JobModerationState> {
  await requireRole("admin", "/admin/jobs");
  const jobId = formData.get("jobId");
  const decision = formData.get("decision");
  const revision = formData.get("expectedUpdatedAt");
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    typeof jobId !== "string" ||
    !UUID_PATTERN.test(jobId) ||
    (decision !== "approve" && decision !== "reject" && decision !== "pause") ||
    typeof revision !== "string" || !Number.isFinite(Date.parse(revision)) ||
    (decision !== "approve" && (reason.length < 1 || reason.length > 500))
  ) {
    return { status: "error", message: "올바른 검토 요청이 아닙니다." };
  }

  const result = await moderatePendingJob(
    jobId,
    decision,
    revision,
    decision === "approve" ? null : reason,
  );
  if (result.status === "updated") {
    refreshAdminJobPaths(jobId, true);
    return {
      status: "success",
      message: decision === "approve"
        ? "공고를 승인했습니다."
        : decision === "pause" ? "공고 게시를 중지했습니다." : "공고를 반려했습니다.",
    };
  }
  if (result.status === "conflict") {
    refreshAdminJobPaths();
    return {
      status: "conflict",
      message: "이미 처리되었거나 대기 상태가 아닌 공고입니다. 목록을 새로고침했습니다.",
    };
  }
  return {
    status: "error",
    message: result.status === "unavailable"
      ? "Supabase가 연결된 환경에서만 공고를 검토할 수 있습니다."
      : "공고 검토를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
