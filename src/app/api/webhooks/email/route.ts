import { Resend } from "resend";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response(null, { status: 400 });
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.RESEND_API_KEY) return new Response(null, { status: 503 });
  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({ payload: await request.text(), headers: { id, timestamp, signature }, webhookSecret });
  } catch { return new Response(null, { status: 400 }); }
  if (event.type !== "email.bounced" && event.type !== "email.complained") return new Response(null, { status: 200 });
  const providerId = event.data?.email_id;
  if (typeof providerId !== "string" || !providerId) return new Response(null, { status: 400 });
  const tag = event.data.tags?.outbox_id;
  const outboxId = typeof tag === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tag) ? tag : null;
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("record_email_webhook", { p_event_id: id, p_kind: event.type, p_provider_id: providerId, p_outbox_id: outboxId });
    return new Response(null, { status: !error && data === true ? 200 : 503 });
  } catch { return new Response(null, { status: 503 }); }
}
