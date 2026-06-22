import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/admin-moderation", () => ({
  moderatePendingJob: vi.fn(),
  setCompanyVerification: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import {
  moderatePendingJob,
  setCompanyVerification,
} from "@/lib/db/admin-moderation";
import { moderateJob } from "@/app/admin/jobs/actions";
import { updateCompanyVerification } from "@/app/admin/companies/actions";

const mockRequireRole = vi.mocked(requireRole);
const mockModerateJob = vi.mocked(moderatePendingJob);
const mockVerification = vi.mocked(setCompanyVerification);
const validJobId = "11111111-1111-4111-8111-111111111111";
const validCompanyId = "22222222-2222-4222-8222-222222222222";
const idle = { status: "idle", message: "" } as const;

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
  mockModerateJob.mockResolvedValue({ status: "updated" });
  mockVerification.mockResolvedValue({ status: "updated" });
});

afterEach(() => vi.clearAllMocks());

function jobForm(decision: "approve" | "reject", jobId = validJobId) {
  const form = new FormData();
  form.set("jobId", jobId);
  form.set("decision", decision);
  form.set("boost", "featured");
  form.set("company_id", "forged-company");
  return form;
}

function companyForm(verification: "verify" | "unverify") {
  const form = new FormData();
  form.set("companyId", validCompanyId);
  form.set("verification", verification);
  form.set("owner_id", "forged-owner");
  return form;
}

describe("admin job moderation action", () => {
  it("reauthenticates exact admin and revalidates public routes on approval", async () => {
    const result = await moderateJob(idle, jobForm("approve"));
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/jobs");
    expect(mockModerateJob).toHaveBeenCalledWith(
      validJobId,
      "approve",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(result.status).toBe("success");
    for (const path of ["/admin", "/admin/jobs", "/jobs", `/jobs/${validJobId}`]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("does not revalidate public routes for rejection", async () => {
    await moderateJob(idle, jobForm("reject"));
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs");
    expect(revalidatePath).not.toHaveBeenCalledWith("/jobs");
  });

  it("treats stale decisions as conflicts and refreshes the queue", async () => {
    mockModerateJob.mockResolvedValue({ status: "conflict" });
    const result = await moderateJob(idle, jobForm("approve"));
    expect(result.status).toBe("conflict");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/jobs");
  });

  it("rejects invalid identifiers and propagates guard redirects", async () => {
    expect((await moderateJob(idle, jobForm("approve", "not-a-uuid"))).status).toBe("error");
    expect(mockModerateJob).not.toHaveBeenCalled();

    const redirect = new Error("NEXT_REDIRECT");
    mockRequireRole.mockRejectedValue(redirect);
    await expect(moderateJob(idle, jobForm("approve"))).rejects.toBe(redirect);
  });
});

describe("admin company verification action", () => {
  it("reauthenticates exact admin and passes only the verification decision", async () => {
    const result = await updateCompanyVerification(idle, companyForm("verify"));
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/companies");
    expect(mockVerification).toHaveBeenCalledWith(validCompanyId, true);
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/companies");
  });

  it("maps database failures to safe messages", async () => {
    mockVerification.mockResolvedValue({ status: "error" });
    const result = await updateCompanyVerification(idle, companyForm("unverify"));
    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/postgres|rls|42501|private/i);
  });
});
