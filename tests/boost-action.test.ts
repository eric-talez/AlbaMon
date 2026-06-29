import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
}) }));
vi.mock("@/lib/auth/guards", () => ({ requireArea: vi.fn() }));
vi.mock("@/lib/payments/boosts", () => ({
  isBoostType: (value: unknown) => value === "featured" || value === "urgent",
  createBoostCheckoutSession: vi.fn(),
}));

import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/guards";
import { createBoostCheckoutSession } from "@/lib/payments/boosts";
import { startBoostCheckout } from "@/app/employer/jobs/[id]/boost/actions";

const mockRequireArea = vi.mocked(requireArea);
const mockCreateCheckout = vi.mocked(createBoostCheckoutSession);
const jobId = "11111111-1111-4111-8111-111111111111";

function form(boostType = "featured"): FormData {
  const data = new FormData();
  data.set("jobId", jobId);
  data.set("boostType", boostType);
  data.set("company_id", "forged-company");
  data.set("boost", "urgent");
  return data;
}

beforeEach(() => {
  mockRequireArea.mockResolvedValue({
    id: "33333333-3333-4333-8333-333333333333",
    email: "employer@example.com",
    role: "employer",
    isDev: false,
  });
  mockCreateCheckout.mockResolvedValue({
    status: "created",
    url: "https://checkout.stripe.test/session",
  });
});

afterEach(() => vi.clearAllMocks());

describe("startBoostCheckout", () => {
  it("reauthenticates employer-area access and redirects to Stripe", async () => {
    await expect(startBoostCheckout(form())).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.test/session",
    );
    expect(mockRequireArea).toHaveBeenCalledWith(
      "employer",
      `/employer/jobs/${jobId}/boost`,
    );
    expect(mockCreateCheckout).toHaveBeenCalledWith({
      userId: "33333333-3333-4333-8333-333333333333",
      jobId,
      boostType: "featured",
    });
  });

  it("blocks seekers or other forbidden roles before checkout creation", async () => {
    const forbidden = new Error("NEXT_REDIRECT:/forbidden");
    mockRequireArea.mockRejectedValue(forbidden);
    await expect(startBoostCheckout(form("urgent"))).rejects.toBe(forbidden);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("rejects invalid client-supplied boost types", async () => {
    await expect(startBoostCheckout(form("premium"))).rejects.toThrow(
      "NEXT_REDIRECT:/employer/jobs?boost=invalid",
    );
    expect(mockRequireArea).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/employer/jobs?boost=invalid");
  });
});
