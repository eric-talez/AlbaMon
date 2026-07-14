import "server-only";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { createJobReport } from "@/lib/db/reports";
import { parseReportForm } from "@/lib/reports/validation";
import { enforceUserPolicy } from "@/lib/rate-limit/service";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";
import { rateLimitedResult } from "@/lib/rate-limit/types";
import type { RateLimitedResult } from "@/lib/rate-limit/types";

export type ReportJobFormState =
  | { status: "idle" | "success" | "duplicate" | "error"; message: string }
  | RateLimitedResult;

export async function submitJobReportForUser(
  jobId: string,
  formData: FormData,
): Promise<ReportJobFormState> {
  const user = await requireUser(`/jobs/${encodeURIComponent(jobId)}/report`);
  const parsed = parseReportForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const limit = await enforceUserPolicy(RATE_LIMIT_POLICIES.createReport, user.id);
  if (!limit.allowed) return rateLimitedResult(limit.retryAfterSeconds);

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
