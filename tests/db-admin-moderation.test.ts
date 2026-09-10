import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAdminCompanies,
  getAdminJobs,
  getAdminQueueCounts,
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

    await expect(getAdminQueueCounts()).resolves.toEqual({
      pendingJobs: { status: "ok", count: 3 },
      unverifiedCompanies: { status: "ok", count: 2 },
      openReports: { status: "ok", count: 4 },
    });
  });

  it("degrades only the failing queue when one count query errors", async () => {
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue(
          table === "reports"
            ? { count: null, error: { message: "boom" } }
            : { count: 1, error: null },
        ),
      })),
    }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getAdminQueueCounts()).resolves.toEqual({
      pendingJobs: { status: "ok", count: 1 },
      unverifiedCompanies: { status: "ok", count: 1 },
      openReports: { status: "error" },
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

  it("adds computed compliance flags to admin job results", async () => {
    const companySelect = vi.fn().mockResolvedValue({
      data: [{ id: "company-1", name: "K-Work Cafe" }],
      error: null,
    });
    const order = vi.fn().mockResolvedValue({
      data: [
        jobRow({
          id: "flagged",
          description: "cash only no tax",
          requirements: ["no visa"],
        }),
      ],
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce({ select: companySelect })
      .mockReturnValueOnce({ select: vi.fn(() => ({ order })) });
    mockClient.mockResolvedValue({ from } as never);

    await expect(getAdminJobs()).resolves.toMatchObject({
      status: "ok",
      jobs: [{
        id: "flagged",
        complianceFlags: expect.arrayContaining([
          expect.objectContaining({ category: "cash_pay" }),
          expect.objectContaining({ category: "work_authorization" }),
        ]),
      }],
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
    await expect(getAdminQueueCounts()).resolves.toEqual({
      pendingJobs: { status: "unavailable" },
      unverifiedCompanies: { status: "unavailable" },
      openReports: { status: "unavailable" },
    });
    expect(mockClient).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
    mockClient.mockRejectedValue(new Error("private database detail"));
    await expect(getAdminCompanies()).resolves.toEqual({ status: "error" });
    await expect(getAdminQueueCounts()).resolves.toEqual({
      pendingJobs: { status: "error" },
      unverifiedCompanies: { status: "error" },
      openReports: { status: "error" },
    });
  });
});

describe("admin moderation writes", () => {
  it("sends revision and reason to the database transition boundary", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ status: "updated" }], error: null });
    mockClient.mockResolvedValue({ rpc } as never);
    await expect(moderatePendingJob("job-1", "approve", "2026-06-21T12:00:00.123456Z")).resolves.toEqual({ status: "updated" });
    expect(rpc).toHaveBeenCalledWith("transition_job", {target_job_id:"job-1",command:"approve",expected_updated_at:"2026-06-21T12:00:00.123456Z",reason:null});
    rpc.mockResolvedValue({ data: [{ status: "conflict" }], error: null });
    await expect(moderatePendingJob("job-1", "reject", "2026-06-21T12:00:00Z", "Policy review")).resolves.toEqual({ status: "conflict" });
    expect(rpc).toHaveBeenLastCalledWith("transition_job", {target_job_id:"job-1",command:"reject",expected_updated_at:"2026-06-21T12:00:00Z",reason:"Policy review"});
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
