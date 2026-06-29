import "server-only";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { createJobReport } from "@/lib/db/reports";
import { parseReportForm } from "@/lib/reports/validation";

export interface ReportJobFormState {
  status: "idle" | "success" | "duplicate" | "error";
  message: string;
}

export async function submitJobReportForUser(
  jobId: string,
  formData: FormData,
): Promise<ReportJobFormState> {
  const user = await requireUser(`/jobs/${encodeURIComponent(jobId)}/report`);
  const parsed = parseReportForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const result = await createJobReport(
    jobId,
    user.id,
    parsed.value.reason,
    parsed.value.details,
  );

  if (result.status === "submitted") {
    revalidatePath("/admin");
    revalidatePath("/admin/reports");
    return {
      status: "success",
      message: "신고를 접수했습니다. K-Work US 운영팀이 검토합니다.",
    };
  }
  if (result.status === "duplicate") {
    return {
      status: "duplicate",
      message: "이미 같은 사유로 신고한 공고입니다.",
    };
  }
  if (result.status === "unavailable") {
    return {
      status: "error",
      message: "신고 기능은 Supabase가 연결된 환경에서 사용할 수 있습니다.",
    };
  }
  if (result.status === "not_allowed") {
    return {
      status: "error",
      message: "이 공고를 신고할 수 없습니다.",
    };
  }
  return {
    status: "error",
    message: "신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
