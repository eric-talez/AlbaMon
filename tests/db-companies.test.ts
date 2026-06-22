import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createEmployerCompany,
  getEmployerCompanies,
  updateEmployerCompany,
} from "@/lib/db/companies";

const mockClient = vi.mocked(createSupabaseServerClient);
const input = {
  name: "K-Work Cafe",
  description: "회사 소개",
  website: null,
  phone: null,
  city: "Los Angeles",
  state: "CA",
  addressDisplay: "Koreatown",
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("employer company reads", () => {
  it("maps owner-visible companies without a mock fallback", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{
        id: "company-1",
        owner_id: "employer-1",
        name: "K-Work Cafe",
        description: "회사 소개",
        website: null,
        phone: null,
        city: "Los Angeles",
        state: "CA",
        address_display: "Koreatown",
        is_verified: false,
        created_at: "2026-06-21T00:00:00Z",
        updated_at: "2026-06-21T00:00:00Z",
      }],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })),
    } as never);

    await expect(getEmployerCompanies("employer-1")).resolves.toMatchObject({
      status: "ok",
      companies: [{ id: "company-1", isVerified: false }],
    });
    expect(eq).toHaveBeenCalledWith("owner_id", "employer-1");
  });

  it("returns unavailable and never queries when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    await expect(getEmployerCompanies("employer-1")).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("employer company writes", () => {
  it("rechecks no existing company and forces trusted owner/verification fields", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const existingSelect = vi.fn(() => ({
      eq: vi.fn(() => ({ limit })),
    }));
    const single = vi.fn().mockResolvedValue({ data: { id: "company-1" }, error: null });
    const insertSelect = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: existingSelect })
      .mockReturnValueOnce({ insert });
    mockClient.mockResolvedValue({ from } as never);

    await expect(createEmployerCompany("employer-1", input)).resolves.toEqual({
      status: "created",
      companyId: "company-1",
    });
    expect(insert).toHaveBeenCalledWith({
      owner_id: "employer-1",
      is_verified: false,
      name: "K-Work Cafe",
      description: "회사 소개",
      website: null,
      phone: null,
      city: "Los Angeles",
      state: "CA",
      address_display: "Koreatown",
    });
  });

  it("does not insert an additional company", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null });
    const insert = vi.fn();
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ limit })) })),
        insert,
      })),
    } as never);
    await expect(createEmployerCompany("employer-1", input)).resolves.toEqual({
      status: "not_allowed",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("updates only allowlisted fields under the trusted owner filter", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "company-1" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(
      updateEmployerCompany("company-1", "employer-1", input),
    ).resolves.toMatchObject({ status: "updated" });
    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({
      owner_id: expect.anything(),
      is_verified: expect.anything(),
    }));
    expect(firstEq).toHaveBeenCalledWith("id", "company-1");
    expect(secondEq).toHaveBeenCalledWith("owner_id", "employer-1");
  });
});
