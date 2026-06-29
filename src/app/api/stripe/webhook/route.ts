import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/payments/stripe-webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const payload = await request.text();
  const result = await handleStripeWebhook(
    payload,
    request.headers.get("stripe-signature"),
  );

  switch (result.status) {
    case "ok":
      return NextResponse.json({ received: true, action: result.action });
    case "bad_signature":
    case "invalid_payload":
      return NextResponse.json({ error: result.status }, { status: 400 });
    case "unavailable":
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    case "error":
    default:
      return NextResponse.json({ error: "webhook_error" }, { status: 500 });
  }
}
