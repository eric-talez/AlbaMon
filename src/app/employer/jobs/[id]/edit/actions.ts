"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { updateEmployerJob, transitionEmployerJob } from "@/lib/db/employer-jobs";
import { parseEmployerJobForm } from "@/lib/employer/validation";
import type { JobFormState } from "../../new/actions";

function target(formData: FormData) {
  const id = formData.get("jobId"), revision = formData.get("expectedUpdatedAt");
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && typeof revision === "string" && Number.isFinite(Date.parse(revision))
    ? { id, revision } : null;
}
function refresh(id: string) {
  for (const path of ["/", "/jobs", `/jobs/${id}`, `/jobs/${id}/apply`, "/employer", "/employer/jobs", `/employer/jobs/${id}/edit`, "/employer/applications", "/dashboard", "/dashboard/applications", "/admin", "/admin/jobs"]) revalidatePath(path);
}
export async function saveEmployerJob(_state: JobFormState, formData: FormData): Promise<JobFormState> {
  await requireRole("employer", "/employer/jobs");
  const job = target(formData);
  if (!job) return { status: "error", message: "올바른 편집 요청이 아닙니다." };
  const parsed = parseEmployerJobForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const result = await updateEmployerJob(job.id, job.revision, parsed.value);
  if (result.status === "updated") {
    refresh(job.id);
    return { status: "success", message: "변경 사항을 저장하고 검토를 요청했습니다.", jobId: job.id };
  }
  return { status: "error", message: result.status === "conflict" ? "다른 변경이 있습니다. 새로고침 후 다시 편집해 주세요." : "공고를 수정할 수 없습니다. 권한과 현재 상태를 확인해 주세요." };
}
export async function changeEmployerJob(formData: FormData): Promise<void> {
  await requireRole("employer", "/employer/jobs");
  const job = target(formData), command = formData.get("command");
  if (!job || (command !== "pause" && command !== "close" && command !== "resubmit")) redirect("/employer/jobs?result=not_allowed");
  const result = await transitionEmployerJob(job.id, command, job.revision);
  refresh(job.id);
  redirect(`/employer/jobs?result=${result.status}`);
}
