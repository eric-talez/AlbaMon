import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/db/reports", () => ({
  createJobReport: vi.fn(),
  updateReportStatus: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { createJobReport, updateReportStatus } from "@/lib/db/reports";
import { parseReportForm } from "@/lib/reports/validation";
import { submitJobReportForUser } from "@/lib/reports/action";
import { reviewReport } from "@/app/admin/reports/actions";

const mockRequireUser = vi.mocked(requireUser);
const mockRequireRole = vi.mocked(requireRole);
const mockCreateReport = vi.mocked(createJobReport);
const mockUpdateReport = vi.mocked(updateReportStatus);
const reportId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle", message: "" } as const;

function reportForm(reason = "spam", details = "Looks wrong"): FormData {
  const form = new FormData();
  form.set("reason", reason);
  form.set("details", details);
  return form;
}

function reviewForm(status = "reviewed", id = reportId): FormData {
  const form = new FormData();
  form.set("reportId", id);
  form.set("status", status);
  return form;
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "seeker",
    isDev: false,
  });
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
  mockCreateReport.mockResolvedValue({ status: "submitted", reportId: "report-1" });
  mockUpdateReport.mockResolvedValue({ status: "updated" });
});

afterEach(() => vi.clearAllMocks());

describe("report form validation", () => {
  it("accepts valid reasons and trims optional details", () => {
    expect(parseReportForm(reportForm("visa_status_preference", "  note  "))).toEqual({
      ok: true,
      value: { reason: "visa_status_preference", details: "note" },
    });
  });

  it("rejects invalid reasons and details over 1,000 characters", () => {
    expect(parseReportForm(reportForm("bogus"))).toMatchObject({ ok: false });
    expect(parseReportForm(reportForm("spam", "x".repeat(1001)))).toMatchObject({
      ok: false,
    });
  });
});

describe("job report action", () => {
  it("requires an authenticated user, submits, and revalidates admin queues", async () => {
    const result = await submitJobReportForUser("job-1", reportForm());

    expect(mockRequireUser).toHaveBeenCalledWith("/jobs/job-1/report");
    expect(mockCreateReport).toHaveBeenCalledWith("job-1", "user-1", "spam", "Looks wrong");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/reports");
    expect(result.status).toBe("success");
  });

  it("redirects unauthenticated users before any database write", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("REDIRECT:/login"));

    await expect(submitJobReportForUser("job-1", reportForm())).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it("returns safe duplicate and unavailable states", async () => {
    mockCreateReport.mockResolvedValueOnce({ status: "duplicate" });
    expect((await submitJobReportForUser("job-1", reportForm())).status).toBe("duplicate");

    mockCreateReport.mockResolvedValueOnce({ status: "unavailable" });
    const unavailable = await submitJobReportForUser("job-1", reportForm());
    expect(unavailable.status).toBe("error");
    expect(unavailable.message).toContain("Supabase");
  });
});

describe("admin report review action", () => {
  it("requires exact admin and marks a report reviewed", async () => {
    const result = await reviewReport(idle, reviewForm("reviewed"));

    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/reports");
    expect(result).toEqual({ status: "success", message: "신고를 검토 완료로 표시했습니다." });
    expect(mockUpdateReport).toHaveBeenCalledWith(reportId, "reviewed");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/reports");
    expect(result.status).toBe("success");
  });

  it("rejects invalid report status before database write", async () => {
    const result = await reviewReport(idle, reviewForm("open"));
    expect(result.status).toBe("error");
    expect(mockUpdateReport).not.toHaveBeenCalled();
  });

  it("blocks non-admin callers before database write", async () => {
    mockRequireRole.mockRejectedValueOnce(new Error("REDIRECT:/forbidden"));

    await expect(reviewReport(idle, reviewForm())).rejects.toThrow("REDIRECT:/forbidden");
    expect(mockUpdateReport).not.toHaveBeenCalled();
  });
});
