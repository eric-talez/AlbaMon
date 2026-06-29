import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { BoostType } from "@/lib/types";
import { isBoostType, activateBoostFromPaidCheckout } from "@/lib/payments/boosts";
import { getStripeWebhookSecret } from "@/lib/payments/config";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StripeCheckoutSession = {
  id?: string;
  object?: string;
  payment_status?: string;
  metadata?: Record<string, string | undefined>;
};

type StripeWebhookEvent = {
  type?: string;
  data?: { object?: StripeCheckoutSession };
};

export type StripeWebhookResult =
  | { status: "ok"; action: "ignored" | "activated" | "not_found" }
  | { status: "bad_signature" | "invalid_payload" | "unavailable" | "error" };

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  return timestamp && signatures.length > 0 ? { timestamp, signatures } : null;
}

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string | null = getStripeWebhookSecret(),
): boolean {
  if (!signatureHeader || !secret) return false;
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return parsed.signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return (
      candidate.length === expectedBuffer.length &&
      timingSafeEqual(candidate, expectedBuffer)
    );
  });
}

function paidCheckoutMetadata(session: StripeCheckoutSession): {
  jobId: string;
  companyId: string;
  boostType: BoostType;
} | null {
  if (session.payment_status !== "paid") return null;
  const metadata = session.metadata ?? {};
  const jobId = metadata.job_id;
  const companyId = metadata.company_id;
  const boostType = metadata.boost_type;
  if (
    !UUID_PATTERN.test(jobId ?? "") ||
    !UUID_PATTERN.test(companyId ?? "") ||
    !isBoostType(boostType)
  ) {
    return null;
  }
  return { jobId: jobId as string, companyId: companyId as string, boostType };
}

export async function handleStripeWebhook(
  payload: string,
  signatureHeader: string | null,
): Promise<StripeWebhookResult> {
  const secret = getStripeWebhookSecret();
  if (!secret) return { status: "unavailable" };
  if (!verifyStripeSignature(payload, signatureHeader, secret)) {
    return { status: "bad_signature" };
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return { status: "invalid_payload" };
  }

  if (event.type !== "checkout.session.completed") {
    return { status: "ok", action: "ignored" };
  }

  const session = event.data?.object;
  const metadata = session ? paidCheckoutMetadata(session) : null;
  if (!metadata) return { status: "invalid_payload" };

  const result = await activateBoostFromPaidCheckout(metadata);
  if (result.status === "activated") return { status: "ok", action: "activated" };
  if (result.status === "not_found") return { status: "ok", action: "not_found" };
  if (result.status === "unavailable") return { status: "unavailable" };
  return { status: "error" };
}
