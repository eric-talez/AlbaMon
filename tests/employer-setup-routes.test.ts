import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/companies", () => ({
  getEmployerCompanies: vi.fn(),
  getOwnedEmployerCompany: vi.fn(),
  createEmployerCompany: vi.fn(),
  updateEmployerCompany: vi.fn(),
}));
vi.mock("@/lib/db/employer-jobs", () => ({
  getEmployerJobs: vi.fn(),
  createEmployerJob: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import { getEmployerCompanies } from "@/lib/db/companies";
import { getEmployerJobs } from "@/lib/db/employer-jobs";
import NewJobPage from "@/app/employer/jobs/new/page";
import EmployerJobsPage from "@/app/employer/jobs/page";

const mockRequireRole = vi.mocked(requireRole);
const mockCompanies = vi.mocked(getEmployerCompanies);
const mockJobs = vi.mocked(getEmployerJobs);

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "employer-1",
    email: "employer@example.com",
    role: "employer",
    isDev: false,
  });
  mockCompanies.mockResolvedValue({ status: "ok", companies: [] });
  mockJobs.mockResolvedValue({ status: "ok", jobs: [] });
});

afterEach(() => vi.clearAllMocks());

describe("employer setup routes", () => {
  it("guards posting and owned jobs with the exact employer role", async () => {
    await NewJobPage();
    expect(mockRequireRole).toHaveBeenCalledWith("employer", "/employer/jobs/new");
    await EmployerJobsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("employer", "/employer/jobs");
  });

  it("blocks posting until an owned company exists", async () => {
    const html = renderToStaticMarkup(await NewJobPage());
    expect(html).toContain("먼저 회사 정보를 등록해 주세요.");
    expect(html).toContain('/employer/company');
  });

  it("shows public links only for approved owned jobs", async () => {
    mockJobs.mockResolvedValue({
      status: "ok",
      jobs: [
        { id: "approved-1", companyId: "company-1", companyName: "Cafe", title: "Approved", moderationStatus: "approved", boost: "featured", createdAt: "2026-06-21T00:00:00Z" },
        { id: "pending-1", companyId: "company-1", companyName: "Cafe", title: "Pending", moderationStatus: "pending", boost: null, createdAt: "2026-06-20T00:00:00Z" },
      ],
    });
    const html = renderToStaticMarkup(await EmployerJobsPage());
    expect(html).toContain('/jobs/approved-1');
    expect(html).not.toContain('href="/jobs/pending-1"');
    expect(html).toContain('/employer/jobs/approved-1/boost');
    expect(html).toContain("승인 전에는 공개되지 않습니다.");
  });

  it("wires multiple-company editing, posting, jobs, and applications", () => {
    const companyPage = readFileSync(
      join(process.cwd(), "src", "app", "employer", "company", "page.tsx"),
      "utf8",
    );
    const companyAction = readFileSync(
      join(process.cwd(), "src", "app", "employer", "company", "actions.ts"),
      "utf8",
    );
    const consolePage = readFileSync(
      join(process.cwd(), "src", "app", "employer", "page.tsx"),
      "utf8",
    );
    expect(companyPage).toContain("result.companies.length > 1");
    expect(companyPage).toContain("company.id === selected?.id");
    expect(companyAction).toContain("getOwnedEmployerCompany(companyId, user.id)");
    for (const href of [
      "/employer/company",
      "/employer/jobs/new",
      "/employer/jobs",
      "/employer/applications",
    ]) {
      expect(consolePage).toContain(href);
    }
  });
});
