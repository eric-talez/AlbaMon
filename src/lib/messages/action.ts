import "server-only";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { sendApplicationMessage } from "@/lib/db/messages";
import { notifyNewMessage } from "@/lib/notifications/dev";

export interface MessageFormState {
  status: "idle" | "success" | "error";
  message: string;
}

type ParticipantRole = "seeker" | "employer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sendMessageForRole(
  role: ParticipantRole,
  basePath: "/dashboard/applications" | "/employer/applications",
  formData: FormData,
): Promise<MessageFormState> {
  const applicationId = formData.get("applicationId");
  const threadPath = typeof applicationId === "string" && UUID_PATTERN.test(applicationId)
    ? `${basePath}/${applicationId}/messages`
    : basePath;
  const user = await requireRole(role, threadPath);

  const bodyValue = formData.get("body");
  if (typeof applicationId !== "string" || !UUID_PATTERN.test(applicationId)) {
    return { status: "error", message: "올바른 메시지 요청이 아닙니다." };
  }
  if (typeof bodyValue !== "string") {
    return { status: "error", message: "메시지 형식이 올바르지 않습니다." };
  }
  const body = bodyValue.trim();
  if (!body || body.length > 2_000) {
    return {
      status: "error",
      message: "메시지는 1자 이상 2,000자 이하로 입력해 주세요.",
    };
  }

  const result = await sendApplicationMessage(applicationId, user.id, body);
  if (result.status === "sent") {
    // Best-effort dev notification: a notify failure must never turn a
    // successfully sent message into an error for the user.
    try {
      notifyNewMessage(applicationId, result.messageId, role);
    } catch (err) {
      console.error("[notification] new_message failed:", err);
    }
    revalidatePath(`/dashboard/applications/${applicationId}/messages`);
    revalidatePath(`/employer/applications/${applicationId}/messages`);
    return { status: "success", message: "메시지를 보냈습니다." };
  }
  if (result.status === "unavailable") {
    return {
      status: "error",
      message: "Supabase가 연결된 환경에서만 메시지를 보낼 수 있습니다.",
    };
  }
  if (result.status === "not_allowed") {
    return { status: "error", message: "이 대화에 메시지를 보낼 권한이 없습니다." };
  }
  return {
    status: "error",
    message: "메시지를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
