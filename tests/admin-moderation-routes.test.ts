import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/admin-moderation", () => ({
  getAdminModerationCounts: vi.fn(),
  getAdminJobs: vi.fn(),
  getAdminCompanies: vi.fn(),
  moderatePendingJob: vi.fn(),
  setCompanyVerification: vi.fn(),
}));
vi.mock("@/lib/db/reports", () => ({
  getAdminReports: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import {
  getAdminCompanies,
  getAdminJobs,
  getAdminModerationCounts,
} from "@/lib/db/admin-moderation";
import { getAdminReports } from "@/lib/db/reports";
import AdminHomePage from "@/app/admin/page";
import AdminJobsPage from "@/app/admin/jobs/page";
import AdminCompaniesPage from "@/app/admin/companies/page";
import AdminReportsPage from "@/app/admin/reports/page";

const mockRequireRole = vi.mocked(requireRole);
const mockCounts = vi.mocked(getAdminModerationCounts);
const mockJobs = vi.mocked(getAdminJobs);
const mockCompanies = vi.mocked(getAdminCompanies);
const mockReports = vi.mocked(getAdminReports);

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
  mockCounts.mockResolvedValue({
    status: "ok",
    counts: { pendingJobs: 2, unverifiedCompanies: 1, openReports: 3 },
  });
  mockJobs.mockResolvedValue({ status: "ok", jobs: [] });
  mockCompanies.mockResolvedValue({ status: "ok", companies: [] });
  mockReports.mockResolvedValue({ status: "ok", reports: [] });
});

afterEach(() => vi.clearAllMocks());

describe("admin moderation routes", () => {
  it("guards every page with the exact admin role and links dashboard queues", async () => {
    const home = renderToStaticMarkup(await AdminHomePage());
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin");
    expect(home).toContain('href="/admin/jobs"');
    expect(home).toContain('href="/admin/companies"');
    expect(home).toContain('href="/admin/reports"');
    expect(home).toContain(">2<");
    expect(home).toContain(">1<");
    expect(home).toContain(">3<");

    await AdminJobsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/jobs");
    await AdminCompaniesPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/companies");
    await AdminReportsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/reports");
  });

  it("shows full job content and moderation controls only for pending jobs", async () => {
    mockJobs.mockResolvedValue({
      status: "ok",
      jobs: [
        adminJob("11111111-1111-4111-8111-111111111111", "pending", "Pending job"),
        adminJob("22222222-2222-4222-8222-222222222222", "approved", "Approved job"),
      ],
    });
    const html = renderToStaticMarkup(await AdminJobsPage());
    expect(html).toContain("Pending job");
    expect(html).toContain("Approved job");
    expect(html).toContain("Full description");
    expect(html).toContain("Prepare orders");
    expect(html.match(/name="decision"/g)).toHaveLength(2);
  });

  it("shows company owner fallbacks and verification controls", async () => {
    mockCompanies.mockResolvedValue({
      status: "ok",
      companies: [{
        id: "33333333-3333-4333-8333-333333333333",
        name: "K-Work Cafe",
        description: null,
        website: null,
        phone: null,
        city: "Los Angeles",
        state: "CA",
        addressDisplay: null,
        isVerified: false,
        ownerDisplayName: null,
        ownerEmail: null,
        createdAt: "2026-06-21T00:00:00Z",
      }],
    });
    const html = renderToStaticMarkup(await AdminCompaniesPage());
    expect(html).toContain("K-Work Cafe");
    expect(html).toContain("이름 정보 없음");
    expect(html).toContain("이메일 정보 없음");
    expect(html).toContain("회사 인증");
  });

  it("shows report queue details and scoped review controls", async () => {
    mockReports.mockResolvedValue({
      status: "ok",
      reports: [{
        id: "44444444-4444-4444-8444-444444444444",
        reason: "misleading_or_suspicious",
        details: "Suspicious pay claim",
        status: "open",
        jobId: "job-1",
        jobTitle: "Server",
        companyName: "K-Work Cafe",
        jobModerationStatus: "approved",
        reporterDisplayName: "Reporter",
        reporterEmail: "reporter@example.com",
        submittedAt: "2026-06-21T00:00:00Z",
      }],
    });

    const html = renderToStaticMarkup(await AdminReportsPage());
    expect(html).toContain("Server");
    expect(html).toContain("K-Work Cafe");
    expect(html).toContain("Suspicious pay claim");
    expect(html).toContain("reporter@example.com");
    expect(html).toContain('name="status"');
    expect(html).toContain('value="reviewed"');
    expect(html).toContain('value="dismissed"');
  });

  it("does not expose broad reporter profile fields in report queue code", () => {
    const dbSource = read("src/lib/db/reports.ts");
    expect(dbSource).toContain('.select("id, display_name, email")');
    expect(dbSource).not.toMatch(/phone|metadata|address/i);
    expect(dbSource).not.toMatch(/service.?role/i);
  });

  it("distinguishes empty, unavailable, and database-error states", async () => {
    const emptyJobs = renderToStaticMarkup(await AdminJobsPage());
    expect(emptyJobs).toContain("등록된 공고가 없습니다.");

    mockCompanies.mockResolvedValue({ status: "unavailable" });
    const unavailableCompanies = renderToStaticMarkup(await AdminCompaniesPage());
    expect(unavailableCompanies).toContain("Supabase가 연결된 환경");

    mockCounts.mockResolvedValue({ status: "error" });
    const errorDashboard = renderToStaticMarkup(await AdminHomePage());
    expect(errorDashboard).toContain("검토 현황을 불러오지 못했습니다.");

    const emptyReports = renderToStaticMarkup(await AdminReportsPage());
    expect(emptyReports).toContain("접수된 신고가 없습니다.");

    mockReports.mockResolvedValue({ status: "unavailable" });
    const unavailableReports = renderToStaticMarkup(await AdminReportsPage());
    expect(unavailableReports).toContain("Supabase가 연결된 환경");
  });
});

describe("admin moderation static security boundaries", () => {
  it("keeps owner profiles narrow, mutations allowlisted, and service-role absent", () => {
    const dbSource = read("src/lib/db/admin-moderation.ts");
    expect(dbSource).toContain('.select("id, display_name, email")');
    expect(dbSource).not.toMatch(/\.select\("id, display_name, email, phone/i);
    expect(dbSource).not.toMatch(/service.?role/i);
    expect(dbSource).toContain('.eq("id", jobId)');
    expect(dbSource).toContain('.eq("moderation_status", "pending")');
    expect(dbSource).toContain('{ is_verified: isVerified }');
  });

  it("relies on existing admin policies, trusted triggers, and approved-only public view", () => {
    const initial = read("supabase/migrations/20260621000000_init_schema.sql");
    const hardening = read("supabase/migrations/20260625000000_employer_write_hardening.sql");
    const publicView = read("supabase/migrations/20260622000000_audit_hardening.sql");
    for (const policy of [
      "profiles_select_admin",
      "companies_select_admin",
      "companies_update_admin",
      "jobs_select_admin",
      "jobs_update_admin",
    ]) {
      expect(initial).toContain(policy);
    }
    expect(hardening).toMatch(/not\s+public\.is_admin\(\)/i);
    expect(publicView).toMatch(/where\s+j\.moderation_status\s*=\s*'approved'/i);
  });
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}

function adminJob(id: string, status: "pending" | "approved", title: string) {
  return {
    id,
    companyName: "K-Work Cafe",
    title,
    category: "restaurant_cafe" as const,
    jobType: "part_time" as const,
    city: "Los Angeles",
    state: "CA",
    addressDisplay: null,
    addressDisplayMode: "city_only" as const,
    payMin: 20,
    payMax: 25,
    payUnit: "hour" as const,
    tipsAvailable: true,
    scheduleDays: "Mon-Fri",
    scheduleTimeRange: "09:00-17:00",
    languageRequirement: "korean_helpful" as const,
    description: "Full description",
    responsibilities: ["Prepare orders"],
    requirements: ["Customer service"],
    benefits: ["Meal"],
    moderationStatus: status,
    createdAt: "2026-06-21T00:00:00Z",
  };
}
