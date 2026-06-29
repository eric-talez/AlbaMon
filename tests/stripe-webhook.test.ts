import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments/boosts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/boosts")>(
    "@/lib/payments/boosts",
  );
  return {
    isBoostType: actual.isBoostType,
    activateBoostFromPaidCheckout: vi.fn(),
  };
});

import { activateBoostFromPaidCheckout } from "@/lib/payments/boosts";
import {
  handleStripeWebhook,
  verifyStripeSignature,
} from "@/lib/payments/stripe-webhook";

const mockActivate = vi.mocked(activateBoostFromPaidCheckout);
const secret = "whsec_realish_test_secret";
const jobId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

function sign(payload: string, timestamp = "1760000000"): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function checkoutPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        payment_status: "paid",
        metadata: {
          job_id: jobId,
          company_id: companyId,
          boost_type: "featured",
          initiating_user_id: "33333333-3333-4333-8333-333333333333",
        },
        ...overrides,
      },
    },
  });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  mockActivate.mockResolvedValue({ status: "activated" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Stripe webhook signature verification", () => {
  it("rejects missing or invalid signatures", async () => {
    const payload = checkoutPayload();
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
    expect(verifyStripeSignature(payload, "t=1,v1=bad", secret)).toBe(false);
    await expect(handleStripeWebhook(payload, null)).resolves.toEqual({
      status: "bad_signature",
    });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("accepts valid Stripe signatures over the raw body", () => {
    const payload = checkoutPayload();
    expect(verifyStripeSignature(payload, sign(payload), secret)).toBe(true);
  });
});

describe("Stripe checkout completion handling", () => {
  it("ignores unrelated events safely", async () => {
    const payload = JSON.stringify({ type: "customer.created", data: { object: {} } });
    await expect(handleStripeWebhook(payload, sign(payload))).resolves.toEqual({
      status: "ok",
      action: "ignored",
    });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("activates a boost only for a valid paid checkout session", async () => {
    const payload = checkoutPayload();
    await expect(handleStripeWebhook(payload, sign(payload))).resolves.toEqual({
      status: "ok",
      action: "activated",
    });
    expect(mockActivate).toHaveBeenCalledWith({
      jobId,
      companyId,
      boostType: "featured",
    });
  });

  it("rejects unpaid sessions and invalid metadata", async () => {
    const unpaid = checkoutPayload({ payment_status: "unpaid" });
    await expect(handleStripeWebhook(unpaid, sign(unpaid))).resolves.toEqual({
      status: "invalid_payload",
    });

    const badMetadata = checkoutPayload({ metadata: { job_id: jobId, company_id: companyId, boost_type: "premium" } });
    await expect(handleStripeWebhook(badMetadata, sign(badMetadata))).resolves.toEqual({
      status: "invalid_payload",
    });
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it("returns ok for duplicate paid checkout deliveries", async () => {
    const payload = checkoutPayload();
    await handleStripeWebhook(payload, sign(payload));
    await handleStripeWebhook(payload, sign(payload));
    expect(mockActivate).toHaveBeenCalledTimes(2);
    expect(mockActivate).toHaveBeenNthCalledWith(1, {
      jobId,
      companyId,
      boostType: "featured",
    });
    expect(mockActivate).toHaveBeenNthCalledWith(2, {
      jobId,
      companyId,
      boostType: "featured",
    });
  });
});
