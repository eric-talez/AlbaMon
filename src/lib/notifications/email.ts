import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";

const fixedPaths = new Set(["/employer/applications", "/dashboard/applications", "/employer/jobs", "/admin/employer-requests", "/employer/request-access", "/admin/jobs", "/admin/reports"]);
const messagePath = /^\/(dashboard|employer)\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/messages$/;
export class NotificationEmailError extends Error {
  constructor(public code: string, public retryable: boolean, public retryAfterSeconds = 0) { super(code); }
}

export function emailDeliveryConfigured(): boolean {
  const mailbox = /^[^\s<>@*,;]+@[^\s<>@*,;]+\.[^\s<>@*,;]+$/;
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const address = from.endsWith(">") ? from.slice(from.lastIndexOf("<") + 1, -1) : from;
  const allowlist = (process.env.EMAIL_STAGING_ALLOWLIST ?? "").split(",").map(value => value.trim());
  try { notificationText("/dashboard/applications"); } catch { return false; }
  return process.env.EMAIL_PROVIDER === "resend" && process.env.EMAIL_NOTIFICATIONS_ENABLED === "true" &&
    Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_WEBHOOK_SECRET?.trim() && process.env.CRON_SECRET?.trim()) &&
    mailbox.test(address) && !/[\r\n]/.test(from) &&
    ["staging", "production"].includes(process.env.EMAIL_ENVIRONMENT ?? "") &&
    (process.env.EMAIL_ENVIRONMENT !== "staging" || allowlist.every(value => mailbox.test(value)));
}
export function notificationText(path: string): string {
  if (!fixedPaths.has(path) && !messagePath.test(path)) throw new NotificationEmailError("invalid_notification_path", false);
  let origin: URL;
  try { origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? ""); }
  catch { throw new NotificationEmailError("email_configuration", false); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new NotificationEmailError("email_configuration", false);
  }
  return `새 알림이 있습니다. 로그인 후 확인해 주세요.\n${origin.origin}${path}`;
}
export type NotificationEmail = { eventId: string; to: string; path: string };
function payload(input: NotificationEmail) {
  if (!emailDeliveryConfigured()) throw new NotificationEmailError("email_configuration", false);
  if (process.env.EMAIL_ENVIRONMENT === "staging") {
    const allowlist = (process.env.EMAIL_STAGING_ALLOWLIST ?? "").split(",").map(address => address.trim()).filter(Boolean);
    if (!allowlist.includes(input.to)) throw new NotificationEmailError("staging_recipient_not_allowed", false);
  }
  return { from: process.env.EMAIL_FROM!.trim(), to: [input.to], subject: "K-Work US 알림", text: notificationText(input.path), tags: [{ name: "outbox_id", value: input.eventId }] };
}
export function notificationPayloadHash(input: NotificationEmail): string {
  return createHash("sha256").update(JSON.stringify(payload(input))).digest("hex");
}
export async function sendNotificationEmail(input: NotificationEmail): Promise<{ providerId: string }> {
  const message = payload(input);
  const resend = new Resend(process.env.RESEND_API_KEY, { baseUrl: "https://api.resend.com" });
  const signal = AbortSignal.timeout(10_000);
  // Pinned SDK6.26.0 forwards this signal to fetch; retain the abort test on upgrades.
  const options = { idempotencyKey: input.eventId, signal };
  const { data, error, headers } = await resend.emails.send(message, options);
  if (error) {
    const retryable = signal.aborted || error.statusCode == null || error.statusCode === 429 || error.statusCode >= 500 || error.name === "concurrent_idempotent_requests";
    const retryAfter = headers?.["retry-after"];
    const seconds = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)) : 0;
    // Never store provider messages: they can echo recipients or request content.
    const code = signal.aborted ? "provider_timeout" : `provider_${error.name.replace(/[^a-z_]/g, "").slice(0, 60)}`;
    throw new NotificationEmailError(code, retryable, Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 86400)) : 0);
  }
  if (!data?.id) throw new NotificationEmailError("provider_unknown_result", true);
  return { providerId: data.id };
}
