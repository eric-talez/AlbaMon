import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  isSupabaseServiceRoleConfigured: vi.fn(),
}));

import {
  createSupabaseServiceRoleClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service";
import { activateBoostFromPaidCheckout } from "@/lib/payments/boosts";

const mockServiceClient = vi.mocked(createSupabaseServiceRoleClient);
const mockServiceConfigured = vi.mocked(isSupabaseServiceRoleConfigured);
const jobId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  mockServiceConfigured.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("activateBoostFromPaidCheckout", () => {
  it("updates only the intended job boost through the service-role path", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: jobId }, error: null });
    const companyEq = vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) }));
    const idEq = vi.fn(() => ({ eq: companyEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    mockServiceClient.mockReturnValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(
      activateBoostFromPaidCheckout({ jobId, companyId, boostType: "urgent" }),
    ).resolves.toEqual({ status: "activated" });
    expect(update).toHaveBeenCalledWith({ boost: "urgent" });
    expect(idEq).toHaveBeenCalledWith("id", jobId);
    expect(companyEq).toHaveBeenCalledWith("company_id", companyId);
  });

  it("is safe to repeat for duplicate webhook deliveries", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: jobId }, error: null });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })) })),
    }));
    mockServiceClient.mockReturnValue({ from: vi.fn(() => ({ update })) } as never);

    await activateBoostFromPaidCheckout({ jobId, companyId, boostType: "featured" });
    await activateBoostFromPaidCheckout({ jobId, companyId, boostType: "featured" });
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { boost: "featured" });
    expect(update).toHaveBeenNthCalledWith(2, { boost: "featured" });
  });

  it("does not update for invalid boost types or missing service-role config", async () => {
    await expect(
      activateBoostFromPaidCheckout({
        jobId,
        companyId,
        boostType: "premium" as never,
      }),
    ).resolves.toEqual({ status: "invalid" });
    expect(mockServiceClient).not.toHaveBeenCalled();

    mockServiceConfigured.mockReturnValue(false);
    await expect(
      activateBoostFromPaidCheckout({ jobId, companyId, boostType: "featured" }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockServiceClient).not.toHaveBeenCalled();
  });
});
