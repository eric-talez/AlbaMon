import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createEmployerJob, getEmployerJobs } from "@/lib/db/employer-jobs";

const mockClient = vi.mocked(createSupabaseServerClient);
const input = {
  title: "바리스타",
  category: "restaurant_cafe" as const,
  jobType: "part_time" as const,
  city: "Los Angeles",
  state: "CA",
  addressDisplay: "Los Angeles, CA",
  addressDisplayMode: "city_only" as const,
  payMin: 20,
  payMax: 25,
  payUnit: "hour" as const,
  tipsAvailable: true,
  scheduleDays: "월–금",
  scheduleTimeRange: "09:00–17:00",
  languageRequirement: "korean_helpful" as const,
  description: "고객 응대",
  responsibilities: ["음료 제조"],
  requirements: [],
  benefits: [],
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getEmployerJobs", () => {
  it("returns every owned moderation status with mapped company names", async () => {
    const companyOrder = vi.fn().mockResolvedValue({
      data: [{ id: "company-1", name: "K-Work Cafe" }],
      error: null,
    });
    const jobOrder = vi.fn().mockResolvedValue({
      data: [
        { id: "job-1", company_id: "company-1", title: "Pending", moderation_status: "pending", created_at: "2026-06-21T00:00:00Z" },
        { id: "job-2", company_id: "company-1", title: "Draft", moderation_status: "draft", created_at: "2026-06-20T00:00:00Z" },
        { id: "job-3", company_id: "company-1", title: "Rejected", moderation_status: "rejected", created_at: "2026-06-19T00:00:00Z" },
      ],
      error: null,
    });
    const companyEq = vi.fn(() => ({ order: companyOrder }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn(() => ({ eq: companyEq })) })
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          in: vi.fn(() => ({ order: jobOrder })),
        })),
      });
    mockClient.mockResolvedValue({ from } as never);

    const result = await getEmployerJobs("employer-1");
    expect(companyEq).toHaveBeenCalledWith("owner_id", "employer-1");
    expect(result).toMatchObject({ status: "ok" });
    if (result.status === "ok") {
      expect(result.jobs.map((job) => job.moderationStatus)).toEqual([
        "pending",
        "draft",
        "rejected",
      ]);
      expect(result.jobs.every((job) => job.companyName === "K-Work Cafe")).toBe(true);
    }
  });
});

describe("createEmployerJob", () => {
  it("verifies ownership immediately before forcing pending and null boost", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "company-1" }, error: null });
    const secondEq = vi.fn(() => ({ maybeSingle }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const companySelect = vi.fn(() => ({ eq: firstEq }));
    const single = vi.fn().mockResolvedValue({ data: { id: "job-1" }, error: null });
    const jobSelect = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: jobSelect }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: companySelect })
      .mockReturnValueOnce({ insert });
    mockClient.mockResolvedValue({ from } as never);

    await expect(
      createEmployerJob("employer-1", "company-1", input),
    ).resolves.toEqual({ status: "created", jobId: "job-1" });
    expect(firstEq).toHaveBeenCalledWith("id", "company-1");
    expect(secondEq).toHaveBeenCalledWith("owner_id", "employer-1");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: "company-1",
      moderation_status: "pending",
      boost: null,
    }));
  });

  it("does not insert when the selected company is not owned", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const insert = vi.fn();
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        })),
        insert,
      })),
    } as never);

    await expect(
      createEmployerJob("employer-1", "other-company", input),
    ).resolves.toEqual({ status: "not_allowed" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("never creates mock jobs when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    await expect(
      createEmployerJob("employer-1", "company-1", input),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});
