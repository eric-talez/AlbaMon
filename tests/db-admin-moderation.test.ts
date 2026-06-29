import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAdminCompanies,
  getAdminJobs,
  getAdminModerationCounts,
  moderatePendingJob,
  setCompanyVerification,
} from "@/lib/db/admin-moderation";

const mockClient = vi.mocked(createSupabaseServerClient);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("admin moderation reads", () => {
  it("returns exact pending, unverified, and open-report counts", async () => {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue(
          table === "jobs"
            ? { count: 3, error: null }
            : table === "reports"
              ? { count: 4, error: null }
            : { count: 2, error: null },
        ),
      })),
    }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getAdminModerationCounts()).resolves.toEqual({
      status: "ok",
      counts: { pendingJobs: 3, unverifiedCompanies: 2, openReports: 4 },
    });
  });

  it("maps jobs and prioritizes pending before newest non-pending jobs", async () => {
    const companySelect = vi.fn().mockResolvedValue({
      data: [{ id: "company-1", name: "K-Work Cafe" }],
      error: null,
    });
    const order = vi.fn().mockResolvedValue({
      data: [
        jobRow({ id: "approved", moderation_status: "approved", created_at: "2026-06-22T00:00:00Z" }),
        jobRow({ id: "pending", moderation_status: "pending", created_at: "2026-06-21T00:00:00Z" }),
      ],
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce({ select: companySelect })
      .mockReturnValueOnce({ select: vi.fn(() => ({ order })) });
    mockClient.mockResolvedValue({ from } as never);

    const result = await getAdminJobs();
    expect(result).toMatchObject({
      status: "ok",
      jobs: [{ id: "pending" }, { id: "approved" }],
    });
  });

  it("selects only safe owner profile fields and maps nullable fallbacks", async () => {
    const companyOrder = vi.fn().mockResolvedValue({
      data: [{
        id: "company-1",
        owner_id: "owner-1",
        name: "Cafe",
        description: null,
        website: null,
        phone: null,
        city: "Los Angeles",
        state: "CA",
        address_display: null,
        is_verified: false,
        created_at: "2026-06-21T00:00:00Z",
        updated_at: "2026-06-21T00:00:00Z",
      }],
      error: null,
    });
    const profileIn = vi.fn().mockResolvedValue({
      data: [{ id: "owner-1", display_name: null, email: null }],
      error: null,
    });
    const profileSelect = vi.fn(() => ({ in: profileIn }));
    const from = vi.fn()
      .mockReturnValueOnce({ select: vi.fn(() => ({ order: companyOrder })) })
      .mockReturnValueOnce({ select: profileSelect });
    mockClient.mockResolvedValue({ from } as never);

    await expect(getAdminCompanies()).resolves.toMatchObject({
      status: "ok",
      companies: [{ ownerDisplayName: null, ownerEmail: null, isVerified: false }],
    });
    expect(profileSelect).toHaveBeenCalledWith("id, display_name, email");
  });

  it("returns unavailable without querying and returns safe errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    await expect(getAdminJobs()).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
    mockClient.mockRejectedValue(new Error("private database detail"));
    await expect(getAdminCompanies()).resolves.toEqual({ status: "error" });
  });
});

describe("admin moderation writes", () => {
  it("filters approval by id and pending status and sets only approval fields", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "job-1" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const statusEq = vi.fn(() => ({ select }));
    const idEq = vi.fn(() => ({ eq: statusEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(
      moderatePendingJob("job-1", "approve", "2026-06-21T12:00:00.000Z"),
    ).resolves.toEqual({ status: "updated" });
    expect(update).toHaveBeenCalledWith({
      moderation_status: "approved",
      posted_at: "2026-06-21T12:00:00.000Z",
    });
    expect(idEq).toHaveBeenCalledWith("id", "job-1");
    expect(statusEq).toHaveBeenCalledWith("moderation_status", "pending");
  });

  it("rejects with only status and treats no updated row as a conflict", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const statusEq = vi.fn(() => ({ select }));
    const idEq = vi.fn(() => ({ eq: statusEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(
      moderatePendingJob("job-1", "reject", "ignored"),
    ).resolves.toEqual({ status: "conflict" });
    expect(update).toHaveBeenCalledWith({ moderation_status: "rejected" });
  });

  it("updates only the company verification field", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "company-1" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(setCompanyVerification("company-1", true)).resolves.toEqual({ status: "updated" });
    expect(update).toHaveBeenCalledWith({ is_verified: true });
    expect(eq).toHaveBeenCalledWith("id", "company-1");
  });
});

function jobRow(overrides: Record<string, unknown>) {
  return {
    id: "job-1",
    company_id: "company-1",
    title: "Barista",
    category: "restaurant_cafe",
    job_type: "part_time",
    city: "Los Angeles",
    state: "CA",
    address_display: null,
    address_display_mode: "city_only",
    pay_min: 20,
    pay_max: 25,
    pay_unit: "hour",
    tips_available: true,
    schedule_days: "Mon-Fri",
    schedule_time_range: "09:00-17:00",
    language_requirement: "korean_helpful",
    description: "Customer service",
    responsibilities: [],
    requirements: [],
    benefits: [],
    moderation_status: "pending",
    created_at: "2026-06-21T00:00:00Z",
    ...overrides,
  };
}
