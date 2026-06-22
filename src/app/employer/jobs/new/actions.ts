"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createEmployerJob } from "@/lib/db/employer-jobs";
import { parseEmployerJobForm } from "@/lib/employer/validation";

export interface JobFormState {
  status: "idle" | "success" | "error";
  message: string;
  jobId?: string;
}

export async function submitEmployerJob(
  _previousState: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await requireRole("employer", "/employer/jobs/new");
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "공고 등록은 Supabase가 연결된 환경에서 사용할 수 있습니다." };
  }

  const rawCompanyId = formData.get("companyId");
  if (typeof rawCompanyId !== "string" || !rawCompanyId.trim()) {
    return { status: "error", message: "공고를 등록할 회사를 선택해 주세요." };
  }
  const parsed = parseEmployerJobForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const result = await createEmployerJob(user.id, rawCompanyId.trim(), parsed.value);
  if (result.status === "created") {
    revalidatePath("/employer");
    revalidatePath("/employer/jobs");
    return {
      status: "success",
      message: "공고가 검토 대기(Pending) 상태로 제출되었습니다.",
      jobId: result.jobId,
    };
  }
  if (result.status === "not_allowed") {
    return { status: "error", message: "선택한 회사로 공고를 등록할 권한이 없습니다." };
  }
  if (result.status === "unavailable") {
    return { status: "error", message: "공고 등록 기능을 현재 사용할 수 없습니다." };
  }
  return { status: "error", message: "공고를 제출하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
