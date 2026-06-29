import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createJobReport,
  getAdminReports,
  updateReportStatus,
} from "@/lib/db/reports";

const mockClient = vi.mocked(createSupabaseServerClient);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "sb_publishable_realish_key_value_1234567890",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createJobReport", () => {
  it("verifies the job through the approved-only view and inserts trusted report fields", async () => {
    const jobMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "job-1" },
      error: null,
    });
    const jobEqStatus = vi.fn(() => ({ maybeSingle: jobMaybeSingle }));
    const jobEqId = vi.fn(() => ({ eq: jobEqStatus }));
    const reportSingle = vi.fn().mockResolvedValue({
      data: { id: "report-1" },
      error: null,
    });
    const reportInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: reportSingle })) }));
    const from = vi.fn((table: string) => (
      table === "public_job_listings"
        ? { select: vi.fn(() => ({ eq: jobEqId })) }
        : { insert: reportInsert }
    ));
    mockClient.mockResolvedValue({ from } as never);

    await expect(
      createJobReport(
        "job-1",
        "user-1",
        "misleading_or_suspicious",
        "Looks suspicious",
      ),
    ).resolves.toEqual({ status: "submitted", reportId: "report-1" });
    expect(from).toHaveBeenCalledWith("public_job_listings");
    expect(jobEqStatus).toHaveBeenCalledWith("moderation_status", "approved");
    expect(reportInsert).toHaveBeenCalledWith({
      reporter_id: "user-1",
      job_id: "job-1",
      reason: "misleading_or_suspicious",
      details: "Looks suspicious",
      status: "open",
    });
  });

  it("rejects non-approved or missing jobs before insert", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const insert = vi.fn();
    const from = vi.fn((table: string) => (
      table === "public_job_listings"
        ? { select: vi.fn(() => ({ eq: eqId })) }
        : { insert }
    ));
    mockClient.mockResolvedValue({ from } as never);

    await expect(
      createJobReport("job-2", "user-1", "spam", null),
    ).resolves.toEqual({ status: "not_allowed" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("maps duplicate and RLS/check failures to safe outcomes", async () => {
    for (const [code, expected] of [
      ["23505", "duplicate"],
      ["23514", "not_allowed"],
      ["42501", "not_allowed"],
    ] as const) {
      const jobMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "job-1" },
        error: null,
      });
      const jobEqStatus = vi.fn(() => ({ maybeSingle: jobMaybeSingle }));
      const jobEqId = vi.fn(() => ({ eq: jobEqStatus }));
      const reportSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code },
      });
      const from = vi.fn((table: string) => (
        table === "public_job_listings"
          ? { select: vi.fn(() => ({ eq: jobEqId })) }
          : { insert: vi.fn(() => ({ select: vi.fn(() => ({ single: reportSingle })) })) }
      ));
      mockClient.mockResolvedValue({ from } as never);

      await expect(
        createJobReport("job-1", "user-1", "spam", null),
      ).resolves.toEqual({ status: expected });
    }
  });

  it("returns unavailable and never writes when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(
      createJobReport("kw-001", "user-1", "spam", null),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("getAdminReports", () => {
  it("maps reports newest-first with narrow job/company/reporter fields", async () => {
    const reportOrder = vi.fn().mockResolvedValue({
      data: [{
        id: "report-1",
        reporter_id: "user-1",
        job_id: "job-1",
        company_id: null,
        reason: "spam",
        details: "Repeated listing",
        status: "open",
        created_at: "2026-06-21T00:00:00Z",
      }],
      error: null,
    });
    const jobIn = vi.fn().mockResolvedValue({
      data: [{
        id: "job-1",
        company_id: "company-1",
        title: "Server",
        moderation_status: "approved",
      }],
      error: null,
    });
    const companyIn = vi.fn().mockResolvedValue({
      data: [{ id: "company-1", name: "K-Work Cafe" }],
      error: null,
    });
    const profileIn = vi.fn().mockResolvedValue({
      data: [{ id: "user-1", display_name: "Reporter", email: "r@example.com" }],
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce({ select: vi.fn(() => ({ order: reportOrder })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: jobIn })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: companyIn })) })
      .mockReturnValueOnce({ select: vi.fn(() => ({ in: profileIn })) });
    mockClient.mockResolvedValue({ from } as never);

    await expect(getAdminReports()).resolves.toMatchObject({
      status: "ok",
      reports: [{
        id: "report-1",
        jobTitle: "Server",
        companyName: "K-Work Cafe",
        reporterEmail: "r@example.com",
      }],
    });
  });
});

describe("updateReportStatus", () => {
  it("updates only open reports to reviewed or dismissed", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "report-1" }, error: null });
    const select = vi.fn(() => ({ maybeSingle }));
    const statusEq = vi.fn(() => ({ select }));
    const idEq = vi.fn(() => ({ eq: statusEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ update })) } as never);

    await expect(updateReportStatus("report-1", "reviewed")).resolves.toEqual({
      status: "updated",
    });
    expect(update).toHaveBeenCalledWith({ status: "reviewed" });
    expect(statusEq).toHaveBeenCalledWith("status", "open");
  });
});
