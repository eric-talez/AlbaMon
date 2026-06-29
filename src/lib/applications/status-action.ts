import "server-only";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { updateApplicationStatus } from "@/lib/db/applications";
import { notifyApplicationStatusChanged } from "@/lib/notifications/dev";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@/lib/types";

export interface ApplicationStatusFormState {
  status: "idle" | "success" | "error";
  message: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Employer-only application status update. Re-authenticates the caller with the
 * exact `employer` runtime role (seekers/admins never reach the DB write here),
 * validates the requested status against the supported set, and delegates the
 * ownership gate to RLS. A successful update fires the development
 * status-change notification; a notification failure never turns a successful
 * update into an error for the user. All user-facing messages are safe and
 * Korean-first — they never leak Postgres codes or RLS details.
 */
export async function updateApplicationStatusForEmployer(
  formData: FormData,
): Promise<ApplicationStatusFormState> {
  await requireRole("employer", "/employer/applications");

  const applicationId = formData.get("applicationId");
  const nextStatus = formData.get("status");

  if (typeof applicationId !== "string" || !UUID_PATTERN.test(applicationId)) {
    return { status: "error", message: "올바른 상태 변경 요청이 아닙니다." };
  }
  if (!isApplicationStatus(nextStatus)) {
    return { status: "error", message: "지원하지 않는 상태입니다." };
  }

  const result = await updateApplicationStatus(applicationId, nextStatus);

  if (result.status === "updated") {
    // Best-effort dev notification: a notify failure must never turn a
    // successful status update into an error for the user.
    try {
      notifyApplicationStatusChanged(
        applicationId,
        result.previousStatus,
        result.nextStatus,
      );
    } catch (err) {
      console.error("[notification] application_status_changed failed:", err);
    }
    revalidatePath("/employer/applications");
    revalidatePath("/dashboard/applications");
    return {
      status: "success",
      message: `상태를 '${APPLICATION_STATUS_LABELS[nextStatus]}'(으)로 변경했습니다.`,
    };
  }

  if (result.status === "unavailable") {
    return {
      status: "error",
      message: "Supabase가 연결된 환경에서만 상태를 변경할 수 있습니다.",
    };
  }
  if (result.status === "not_found" || result.status === "not_allowed") {
    return {
      status: "error",
      message: "이 지원서의 상태를 변경할 권한이 없습니다.",
    };
  }
  return {
    status: "error",
    message: "상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
