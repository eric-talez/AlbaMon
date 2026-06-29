import "server-only";

import type { Role } from "@/lib/types";

export type DevNotificationEvent =
  | {
      type: "application_submitted";
      applicationId: string;
      audience: "employer";
    }
  | {
      type: "application_status_changed";
      applicationId: string;
      audience: "seeker";
      previousStatus: string;
      nextStatus: string;
    }
  | {
      type: "new_message";
      applicationId: string;
      messageId: string;
      audience: "seeker" | "employer";
    };

export type DevNotificationResult = "logged" | "skipped";

export function emitDevNotification(
  event: DevNotificationEvent,
): DevNotificationResult {
  if (process.env.NODE_ENV === "production") return "skipped";
  console.info("[notification:dev]", JSON.stringify(event));
  return "logged";
}

export function notifyApplicationSubmitted(
  applicationId: string,
): DevNotificationResult {
  return emitDevNotification({
    type: "application_submitted",
    applicationId,
    audience: "employer",
  });
}

// Development-only status-change notification stub; real email delivery remains
// deferred.
export function notifyApplicationStatusChanged(
  applicationId: string,
  previousStatus: string,
  nextStatus: string,
): DevNotificationResult {
  return emitDevNotification({
    type: "application_status_changed",
    applicationId,
    audience: "seeker",
    previousStatus,
    nextStatus,
  });
}

export function notifyNewMessage(
  applicationId: string,
  messageId: string,
  senderRole: Extract<Role, "seeker" | "employer">,
): DevNotificationResult {
  return emitDevNotification({
    type: "new_message",
    applicationId,
    messageId,
    audience: senderRole === "seeker" ? "employer" : "seeker",
  });
}
