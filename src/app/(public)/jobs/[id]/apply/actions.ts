"use server";

import { getApprovedJobById } from "@/lib/db/jobs";
import { createApplication } from "@/lib/db/applications";
import { requireUser } from "@/lib/auth/guards";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { notifyApplicationSubmitted } from "@/lib/notifications/dev";

export interface ApplicationFormState {
  status: "idle" | "success" | "duplicate" | "error";
  message: string;
}

export async function submitApplication(
  jobId: string,
  _previousState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const applyPath = `/jobs/${encodeURIComponent(jobId)}/apply`;
  const user = await requireUser(applyPath);

  if (user.role !== "seeker") {
    return {
      status: "error",
      message: "구직자 계정만 지원할 수 있습니다. (Only seeker accounts can apply.)",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "지원 기능은 Supabase가 연결된 환경에서 사용할 수 있습니다.",
    };
  }

  const rawCoverNote = formData.get("coverNote");
  if (typeof rawCoverNote !== "string") {
    return { status: "error", message: "지원 메모 형식이 올바르지 않습니다." };
  }

  const trimmedCoverNote = rawCoverNote.trim();
  if (trimmedCoverNote.length > 1_000) {
    return {
      status: "error",
      message: "지원 메모는 1,000자 이하로 작성해 주세요.",
    };
  }

  try {
    const job = await getApprovedJobById(jobId);
    if (!job) {
      return {
        status: "error",
        message: "현재 지원할 수 없는 공고입니다.",
      };
    }
  } catch {
    return {
      status: "error",
      message: "공고 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const result = await createApplication(
    jobId,
    user.id,
    trimmedCoverNote || null,
  );

  switch (result.status) {
    case "created":
      // Best-effort dev notification: a notify failure must never turn a
      // successfully created application into an error for the user.
      try {
        notifyApplicationSubmitted(result.applicationId);
      } catch (err) {
        console.error("[notification] application_submitted failed:", err);
      }
      return {
        status: "success",
        message: "지원이 완료되었습니다. (Application submitted.)",
      };
    case "duplicate":
      return {
        status: "duplicate",
        message: "이미 지원한 공고입니다. (You already applied.)",
      };
    case "not_allowed":
      return {
        status: "error",
        message: "현재 지원할 수 없는 공고입니다.",
      };
    case "unavailable":
      return {
        status: "error",
        message: "지원 기능은 현재 사용할 수 없습니다.",
      };
    case "error":
      return {
        status: "error",
        message: "지원 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      };
  }
}
