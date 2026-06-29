import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createBoostCheckoutSession,
  getOwnedBoostJob,
  isBoostType,
} from "@/lib/payments/boosts";

const mockClient = vi.mocked(createSupabaseServerClient);
const jobId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";

function setSupabaseConfigured(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
}

function setStripeConfigured(): void {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_realish_key_value_1234567890");
  vi.stubEnv("STRIPE_FEATURED_PRICE_ID", "price_featured_123");
  vi.stubEnv("STRIPE_URGENT_PRICE_ID", "price_urgent_123");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
}

function mockOwnedJob(company: unknown = { id: companyId, name: "K-Work Cafe" }) {
  const jobMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: jobId,
      company_id: companyId,
      title: "Server",
      boost: null,
      moderation_status: "approved",
    },
    error: null,
  });
  const companyMaybeSingle = vi.fn().mockResolvedValue({ data: company, error: null });
  const jobEq = vi.fn(() => ({ maybeSingle: jobMaybeSingle }));
  const companyOwnerEq = vi.fn(() => ({ maybeSingle: companyMaybeSingle }));
  const companyIdEq = vi.fn(() => ({ eq: companyOwnerEq }));
  const from = vi
    .fn()
    .mockReturnValueOnce({ select: vi.fn(() => ({ eq: jobEq })) })
    .mockReturnValueOnce({ select: vi.fn(() => ({ eq: companyIdEq })) });
  mockClient.mockResolvedValue({ from } as never);
  return { from, companyOwnerEq };
}

beforeEach(() => {
  setSupabaseConfigured();
  setStripeConfigured();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("boost type validation", () => {
  it("accepts only supported boost types", () => {
    expect(isBoostType("featured")).toBe(true);
    expect(isBoostType("urgent")).toBe(true);
    expect(isBoostType("premium")).toBe(false);
    expect(isBoostType(null)).toBe(false);
  });
});

describe("boost checkout creation", () => {
  it("returns unavailable when Stripe price env vars are missing", async () => {
    vi.stubEnv("STRIPE_FEATURED_PRICE_ID", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      createBoostCheckoutSession({ userId: ownerId, jobId, boostType: "featured" }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("blocks non-owner employers before calling Stripe", async () => {
    mockOwnedJob(null);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      createBoostCheckoutSession({ userId: ownerId, jobId, boostType: "urgent" }),
    ).resolves.toEqual({ status: "not_allowed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a Stripe Checkout session for an owned job without activating boost", async () => {
    const { companyOwnerEq } = mockOwnedJob();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://checkout.stripe.test/session" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await createBoostCheckoutSession({
      userId: ownerId,
      jobId,
      boostType: "featured",
    });

    expect(result).toEqual({
      status: "created",
      url: "https://checkout.stripe.test/session",
    });
    expect(companyOwnerEq).toHaveBeenCalledWith("owner_id", ownerId);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/checkout/sessions",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("metadata[job_id]")).toBe(jobId);
    expect(body.get("metadata[company_id]")).toBe(companyId);
    expect(body.get("metadata[boost_type]")).toBe("featured");
    expect(body.get("metadata[initiating_user_id]")).toBe(ownerId);
    expect(body.get("line_items[0][price]")).toBe("price_featured_123");
    expect(String(body)).not.toContain("boost=featured");
  });

  it("never uses mock checkout when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      createBoostCheckoutSession({ userId: ownerId, jobId, boostType: "featured" }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("owned boost job lookup", () => {
  it("returns current boost state for the owner dashboard/page", async () => {
    mockOwnedJob({ id: companyId, name: "K-Work Cafe" });
    await expect(getOwnedBoostJob(ownerId, jobId)).resolves.toMatchObject({
      id: jobId,
      companyId,
      companyName: "K-Work Cafe",
      boost: null,
      moderationStatus: "approved",
    });
  });
});
