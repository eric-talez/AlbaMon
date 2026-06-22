import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: vi.fn() }));
vi.mock("@/lib/db/companies", () => ({
  createEmployerCompany: vi.fn(),
  getOwnedEmployerCompany: vi.fn(),
  updateEmployerCompany: vi.fn(),
}));
vi.mock("@/lib/db/employer-jobs", () => ({ createEmployerJob: vi.fn() }));

import { requireRole } from "@/lib/auth/guards";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createEmployerCompany,
  getOwnedEmployerCompany,
  updateEmployerCompany,
} from "@/lib/db/companies";
import { createEmployerJob } from "@/lib/db/employer-jobs";
import { saveEmployerCompany } from "@/app/employer/company/actions";
import { submitEmployerJob } from "@/app/employer/jobs/new/actions";

const mockRequireRole = vi.mocked(requireRole);
const mockConfigured = vi.mocked(isSupabaseConfigured);
const mockCreateCompany = vi.mocked(createEmployerCompany);
const mockGetOwnedCompany = vi.mocked(getOwnedEmployerCompany);
const mockUpdateCompany = vi.mocked(updateEmployerCompany);
const mockCreateJob = vi.mocked(createEmployerJob);
const idle = { status: "idle", message: "" } as const;

function companyForm(companyId?: string): FormData {
  const form = new FormData();
  if (companyId) form.set("companyId", companyId);
  form.set("name", "K-Work Cafe");
  form.set("description", "회사 소개");
  form.set("website", "");
  form.set("phone", "");
  form.set("city", "Los Angeles");
  form.set("state", "CA");
  form.set("addressDisplay", "Koreatown");
  form.set("owner_id", "forged-owner");
  form.set("is_verified", "true");
  return form;
}

function jobForm(companyId = "company-1"): FormData {
  const form = new FormData();
  form.set("companyId", companyId);
  form.set("title", "바리스타");
  form.set("category", "restaurant_cafe");
  form.set("jobType", "part_time");
  form.set("city", "Los Angeles");
  form.set("state", "CA");
  form.set("addressDisplayMode", "city_only");
  form.set("payMin", "20");
  form.set("payMax", "25");
  form.set("payUnit", "hour");
  form.set("scheduleDays", "월–금");
  form.set("scheduleTimeRange", "09:00–17:00");
  form.set("languageRequirement", "korean_helpful");
  form.set("description", "고객 응대 업무");
  form.set("moderation_status", "approved");
  form.set("boost", "featured");
  form.set("owner_id", "forged-owner");
  return form;
}

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "employer-1",
    email: "employer@example.com",
    role: "employer",
    isDev: false,
  });
  mockConfigured.mockReturnValue(true);
  mockCreateCompany.mockResolvedValue({ status: "created", companyId: "company-1" });
  mockGetOwnedCompany.mockResolvedValue({ id: "company-1" } as never);
  mockUpdateCompany.mockResolvedValue({ status: "updated", companyId: "company-1" });
  mockCreateJob.mockResolvedValue({ status: "created", jobId: "job-1" });
});

afterEach(() => vi.clearAllMocks());

describe("saveEmployerCompany", () => {
  it("reauthenticates and derives owner identity for creation", async () => {
    const state = await saveEmployerCompany(idle, companyForm());
    expect(mockRequireRole).toHaveBeenCalledWith("employer", "/employer/company");
    expect(state.status).toBe("success");
    expect(mockCreateCompany).toHaveBeenCalledWith(
      "employer-1",
      expect.not.objectContaining({ owner_id: expect.anything(), is_verified: expect.anything() }),
    );
  });

  it("verifies ownership before updating a client-provided company ID", async () => {
    await saveEmployerCompany(idle, companyForm("company-1"));
    expect(mockGetOwnedCompany).toHaveBeenCalledWith("company-1", "employer-1");
    expect(mockUpdateCompany).toHaveBeenCalledWith(
      "company-1",
      "employer-1",
      expect.any(Object),
    );

    mockGetOwnedCompany.mockResolvedValue(null);
    const rejected = await saveEmployerCompany(idle, companyForm("other-company"));
    expect(rejected.status).toBe("error");
    expect(mockUpdateCompany).not.toHaveBeenCalledWith(
      "other-company",
      expect.anything(),
      expect.anything(),
    );
  });

  it("reports the no-additional-company outcome safely", async () => {
    mockCreateCompany.mockResolvedValue({ status: "not_allowed" });
    const state = await saveEmployerCompany(idle, companyForm());
    expect(state).toMatchObject({ status: "error" });
    expect(state.message).not.toMatch(/42501|postgres|rls/i);
  });
});

describe("submitEmployerJob", () => {
  it("reauthenticates and passes only validated business fields", async () => {
    const state = await submitEmployerJob(idle, jobForm());
    expect(mockRequireRole).toHaveBeenCalledWith("employer", "/employer/jobs/new");
    expect(state.status).toBe("success");
    expect(mockCreateJob).toHaveBeenCalledWith(
      "employer-1",
      "company-1",
      expect.not.objectContaining({
        owner_id: expect.anything(),
        moderation_status: expect.anything(),
        boost: expect.anything(),
      }),
    );
  });

  it("returns a safe ownership failure", async () => {
    mockCreateJob.mockResolvedValue({ status: "not_allowed" });
    const state = await submitEmployerJob(idle, jobForm("other-company"));
    expect(state.status).toBe("error");
    expect(state.message).not.toMatch(/42501|postgres|rls/i);
  });

  it("does not write when Supabase is unconfigured", async () => {
    mockConfigured.mockReturnValue(false);
    await saveEmployerCompany(idle, companyForm());
    await submitEmployerJob(idle, jobForm());
    expect(mockCreateCompany).not.toHaveBeenCalled();
    expect(mockCreateJob).not.toHaveBeenCalled();
  });

  it("propagates exact-role guard redirects", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mockRequireRole.mockRejectedValue(redirect);
    await expect(submitEmployerJob(idle, jobForm())).rejects.toBe(redirect);
    expect(mockCreateJob).not.toHaveBeenCalled();
  });
});
