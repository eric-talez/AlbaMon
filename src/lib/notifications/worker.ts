import "server-only";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { emailDeliveryConfigured, NotificationEmailError, notificationPayloadHash, sendNotificationEmail } from "./email";

type Claim = { id: string; recipient_id: string; attempts: number; first_attempt_at: string };
export async function runNotificationBatch(): Promise<{ sent: number; retry: number; failed: number; suppressed: number }> {
  if (!emailDeliveryConfigured()) throw new Error("email_configuration");
  const deadline = Date.now() + 105_000;
  const supabase = createSupabaseServiceRoleClient();
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await supabase.rpc(name, args);
    if (result.error) throw new Error("notification_database_unavailable");
    return result.data;
  }
  const rows = await rpc("claim_notification_batch", { batch_size: 5 }) as Claim[];
  const counts = { sent: 0, retry: 0, failed: 0, suppressed: 0 };
  for (const row of rows) {
    // Context+Auth+hash DB+provider+completion each have a real request timeout.
    if (Date.now() + 30_000 > deadline) break;
    async function finish(status: "sent" | "pending" | "failed" | "suppressed", code: string | null = null, providerId: string | null = null, retryAfterSeconds = 0) {
      const changed = await rpc("finish_notification_attempt", { p_id: row.id, p_attempts: row.attempts, p_status: status, p_error_code: code, p_provider_id: providerId, p_retry_after_seconds: retryAfterSeconds });
      if (changed) counts[status === "pending" ? row.attempts >= 5 ? "failed" : "retry" : status]++;
    }
    // Completion stays outside the provider catch: a lost success write leaves the
    // lease recoverable with the same event ID, never a fresh send or blind update.
    let outcome: { status: "sent" | "pending" | "failed" | "suppressed"; code?: string; providerId?: string; retryAfter?: number };
    try {
      if (Date.now() - Date.parse(row.first_attempt_at) > 23 * 60 * 60 * 1000) {
        outcome = { status: "failed", code: "idempotency_window_expired" };
      } else {
        const contexts = await rpc("get_notification_delivery_context", { p_id: row.id, p_attempts: row.attempts });
        const context = contexts?.[0];
        if (!context) continue; // Deleted recipient, completed webhook, or lost lease.
        if (context.account_status !== "active" || !context.email_notifications_enabled || context.suppressed_email || !context.path) {
          outcome = { status: "suppressed", code: "recipient_unavailable" };
        } else {
          const authUser = await supabase.auth.admin.getUserById(row.recipient_id);
          if (authUser.error && authUser.error.status !== 404) throw new NotificationEmailError("recipient_lookup_unavailable", true);
          const user = authUser.data.user;
          if (!user?.email || !user.email_confirmed_at) {
            outcome = { status: "suppressed", code: "unverified_recipient" };
          } else {
            const input = { eventId: row.id, to: user.email, path: context.path };
            const bound = await rpc("bind_notification_payload", { p_id: row.id, p_attempts: row.attempts, p_hash: notificationPayloadHash(input) });
            if (!bound) outcome = { status: "failed", code: "payload_changed_or_claim_lost" };
            else outcome = { status: "sent", ...(await sendNotificationEmail(input)) };
          }
        }
      }
    } catch (error) {
      if (error instanceof NotificationEmailError) outcome = { status: error.retryable ? "pending" : error.code === "staging_recipient_not_allowed" ? "suppressed" : "failed", code: error.code, retryAfter: error.retryAfterSeconds };
      else outcome = { status: "pending", code: "notification_dependency_unavailable" };
    }
    await finish(outcome.status, outcome.code, outcome.providerId, outcome.retryAfter);
  }
  return counts;
}
