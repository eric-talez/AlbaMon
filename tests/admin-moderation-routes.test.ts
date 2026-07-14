import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/admin-moderation", () => ({
  getAdminQueueCounts: vi.fn(),
  getAdminJobs: vi.fn(),
  getAdminCompanies: vi.fn(),
  moderatePendingJob: vi.fn(),
  setCompanyVerification: vi.fn(),
}));
vi.mock("@/lib/db/reports", () => ({
  getAdminReports: vi.fn(),
}));
vi.mock("@/lib/db/admin-analytics", () => ({
  getAdminAnalytics: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import {
  getAdminCompanies,
  getAdminJobs,
  getAdminQueueCounts,
} from "@/lib/db/admin-moderation";
import { getAdminReports } from "@/lib/db/reports";
import { getAdminAnalytics } from "@/lib/db/admin-analytics";
import AdminHomePage from "@/app/admin/page";
import AdminAnalyticsPage from "@/app/admin/analytics/page";
import AdminJobsPage from "@/app/admin/jobs/page";
import AdminCompaniesPage from "@/app/admin/companies/page";
import AdminReportsPage from "@/app/admin/reports/page";

const mockRequireRole = vi.mocked(requireRole);
const mockCounts = vi.mocked(getAdminQueueCounts);
const mockJobs = vi.mocked(getAdminJobs);
const mockCompanies = vi.mocked(getAdminCompanies);
const mockReports = vi.mocked(getAdminReports);
const mockAnalytics = vi.mocked(getAdminAnalytics);

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
  mockCounts.mockResolvedValue({
    pendingJobs: { status: "ok", count: 2 },
    unverifiedCompanies: { status: "ok", count: 1 },
    openReports: { status: "ok", count: 3 },
  });
  mockJobs.mockResolvedValue({ status: "ok", jobs: [] });
  mockCompanies.mockResolvedValue({ status: "ok", companies: [] });
  mockReports.mockResolvedValue({ status: "ok", reports: [] });
  mockAnalytics.mockResolvedValue({ status: "ok", analytics: analyticsFixture() });
});

afterEach(() => vi.clearAllMocks());

describe("admin moderation routes", () => {
  it("guards every page with the exact admin role and links dashboard queues", async () => {
    const home = renderToStaticMarkup(await AdminHomePage());
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin");
    expect(home).toContain('href="/admin/jobs"');
    expect(home).toContain('href="/admin/companies"');
    expect(home).toContain('href="/admin/reports"');
    expect(home).toContain('href="/admin/analytics"');
    expect(home).toContain("Analytics / KPI dashboard");
    expect(home).toContain(">2<");
    expect(home).toContain(">1<");
    expect(home).toContain(">3<");

    await AdminJobsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/jobs");
    await AdminCompaniesPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/companies");
    await AdminReportsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/reports");
    await AdminAnalyticsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/analytics");
  });

  it("blocks non-admin callers before loading analytics", async () => {
    mockRequireRole.mockRejectedValueOnce(new Error("REDIRECT:/forbidden"));

    await expect(AdminAnalyticsPage()).rejects.toThrow("REDIRECT:/forbidden");
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/analytics");
    expect(mockAnalytics).not.toHaveBeenCalled();
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

  it("shows compliance review flags for pending job moderation", async () => {
    mockJobs.mockResolvedValue({
      status: "ok",
      jobs: [{
        ...adminJob("11111111-1111-4111-8111-111111111111", "pending", "Pending job"),
        complianceFlags: [{
          phrase: "cash only",
          category: "cash_pay",
          reason: "Cash-only pay wording may indicate off-the-books pay.",
        }],
      }],
    });
    const html = renderToStaticMarkup(await AdminJobsPage());
    expect(html).toContain("Compliance review flag");
    expect(html).toContain("cash only");
    expect(html).toContain("not a legal determination");
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

    mockCounts.mockResolvedValue({
      pendingJobs: { status: "error" },
      unverifiedCompanies: { status: "error" },
      openReports: { status: "error" },
    });
    const errorDashboard = renderToStaticMarkup(await AdminHomePage());
    expect(errorDashboard).toContain("관리자 현황을 불러오지 못했습니다.");
    expect(errorDashboard).toContain('href="/admin/jobs"');

    const emptyReports = renderToStaticMarkup(await AdminReportsPage());
    expect(emptyReports).toContain("접수된 신고가 없습니다.");

    mockReports.mockResolvedValue({ status: "unavailable" });
    const unavailableReports = renderToStaticMarkup(await AdminReportsPage());
    expect(unavailableReports).toContain("Supabase가 연결된 환경");
    mockAnalytics.mockResolvedValue({ status: "unavailable" });
    const unavailableAnalytics = renderToStaticMarkup(await AdminAnalyticsPage());
    expect(unavailableAnalytics).toContain("Supabase");
  });
});

describe("admin moderation static security boundaries", () => {
  it("keeps owner profiles narrow, mutations allowlisted, and service-role absent", () => {
    const dbSource = read("src/lib/db/admin-moderation.ts");
    expect(dbSource).toContain('.select("id, display_name, email")');
    expect(dbSource).not.toMatch(/\.select\("id, display_name, email, phone/i);
    expect(dbSource).not.toMatch(/service.?role/i);
    // Writes go through the transactional admin-only SQL functions (Slice 27),
    // never direct table updates from the app.
    expect(dbSource).toContain('.rpc("moderate_pending_job"');
    expect(dbSource).toContain('.rpc("set_company_verification"');
    expect(dbSource).not.toMatch(/from\("jobs"\)\s*\.update/);
    expect(dbSource).not.toMatch(/from\("companies"\)\s*\.update/);
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
    complianceFlags: [],
    createdAt: "2026-06-21T00:00:00Z",
  };
}

function analyticsFixture() {
  return {
    jobs: {
      total: 10,
      byStatus: {
        draft: 0,
        pending: 2,
        approved: 6,
        rejected: 1,
        paused: 1,
        expired: 0,
      },
      draft: 0,
      pending: 2,
      approved: 6,
      rejected: 1,
      paused: 1,
      expired: 0,
      createdLast7Days: 4,
      createdLast30Days: 8,
    },
    applications: {
      total: 20,
      byStatus: {
        submitted: 6,
        reviewing: 5,
        interview: 3,
        offered: 2,
        rejected: 3,
        withdrawn: 1,
      },
      submitted: 6,
      reviewing: 5,
      interview: 3,
      offered: 2,
      rejected: 3,
      withdrawn: 1,
      createdLast7Days: 7,
      createdLast30Days: 15,
    },
    companies: {
      total: 8,
      verified: 5,
      unverified: 3,
      createdLast30Days: 2,
    },
    reports: {
      total: 5,
      byStatus: { open: 3, reviewed: 1, dismissed: 1 },
      open: 3,
      reviewed: 1,
      dismissed: 1,
      createdLast7Days: 2,
      createdLast30Days: 4,
    },
    messages: {
      total: 12,
      createdLast7Days: 3,
      createdLast30Days: 9,
    },
  };
}
