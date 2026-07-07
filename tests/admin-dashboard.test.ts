import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/admin-moderation", () => ({
  getAdminQueueCounts: vi.fn(),
}));
vi.mock("@/lib/db/employer-access-requests", () => ({
  getPendingEmployerAccessRequestCount: vi.fn(),
}));
vi.mock("@/lib/db/audit-logs", () => ({
  getRecentAdminAuditLogs: vi.fn(),
}));
vi.mock("@/lib/ops/health", () => ({
  buildHealthReport: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import {
  getAdminQueueCounts,
  type AdminQueueCountResult,
} from "@/lib/db/admin-moderation";
import { getPendingEmployerAccessRequestCount } from "@/lib/db/employer-access-requests";
import { getRecentAdminAuditLogs } from "@/lib/db/audit-logs";
import { buildHealthReport, type HealthReport } from "@/lib/ops/health";
import AdminHomePage from "@/app/admin/page";

const mockRequireRole = vi.mocked(requireRole);
const mockCounts = vi.mocked(getAdminQueueCounts);
const mockPendingCount = vi.mocked(getPendingEmployerAccessRequestCount);
const mockAudit = vi.mocked(getRecentAdminAuditLogs);
const mockHealth = vi.mocked(buildHealthReport);

const ADMIN_HREFS = [
  "/admin/jobs",
  "/admin/companies",
  "/admin/employer-requests",
  "/admin/reports",
  "/admin/analytics",
] as const;

const UNAVAILABLE = { status: "unavailable" } as const;

function ok(count: number): AdminQueueCountResult {
  return { status: "ok", count };
}

function queueCounts(overrides: Partial<Record<string, AdminQueueCountResult>> = {}) {
  return {
    pendingJobs: ok(2),
    unverifiedCompanies: ok(1),
    openReports: ok(3),
    ...overrides,
  };
}

function healthReport(): HealthReport {
  return {
    status: "ok",
    service: "k-work-us",
    timestamp: "2026-07-06T12:00:00.000Z",
    checks: {
      siteUrl: "configured",
      supabase: "configured",
      email: "deferred",
      analytics: "deferred",
    },
  };
}

function useUnconfiguredQueues(): void {
  mockCounts.mockResolvedValue({
    pendingJobs: UNAVAILABLE,
    unverifiedCompanies: UNAVAILABLE,
    openReports: UNAVAILABLE,
  });
  mockPendingCount.mockResolvedValue(UNAVAILABLE);
  mockAudit.mockResolvedValue(UNAVAILABLE);
}

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
  mockCounts.mockResolvedValue(queueCounts());
  mockPendingCount.mockResolvedValue({ status: "ok", count: 4 });
  mockAudit.mockResolvedValue({ status: "ok", entries: [] });
  mockHealth.mockReturnValue(healthReport());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("admin operations dashboard", () => {
  it("renders the setup-required panel with commands, docs, and health link when Supabase is unconfigured", async () => {
    useUnconfiguredQueues();
    const html = renderToStaticMarkup(await AdminHomePage());

    expect(html).toContain("Admin setup required");
    expect(html).toContain("cp .env.example .env.local");
    expect(html).toContain("supabase start");
    expect(html).toContain("supabase db reset");
    expect(html).toContain("npm run dev");
    expect(html).toContain("docs/LOCAL_SUPABASE.md");
    expect(html).toContain('href="/api/health"');
    expect(html).toContain("preview");
    for (const href of ADMIN_HREFS) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("renders live queue counts when helpers return ok", async () => {
    const html = renderToStaticMarkup(await AdminHomePage());

    expect(html).toContain(">2<");
    expect(html).toContain(">1<");
    expect(html).toContain(">3<");
    expect(html).toContain(">4<");
    expect(html).not.toContain("Admin setup required");
  });

  it("shows healthy empty states for zero counts, not errors", async () => {
    mockCounts.mockResolvedValue({
      pendingJobs: ok(0),
      unverifiedCompanies: ok(0),
      openReports: ok(0),
    });
    mockPendingCount.mockResolvedValue({ status: "ok", count: 0 });
    const html = renderToStaticMarkup(await AdminHomePage());

    expect(html).toContain(">0<");
    expect(html).toContain("All clear / 대기 중인 항목이 없습니다");
    expect(html).not.toContain("Admin setup required");
    expect(html).not.toContain("Supabase 연결 후 표시됩니다");
    expect(html).not.toContain("관리자 현황을 불러오지 못했습니다");
  });

  it("keeps the rest of the dashboard alive when one queue fails", async () => {
    mockCounts.mockResolvedValue(queueCounts({ openReports: { status: "error" } }));
    const html = renderToStaticMarkup(await AdminHomePage());

    expect(html).toContain(">2<");
    expect(html).toContain(">4<");
    expect(html).toContain("관리자 현황을 불러오지 못했습니다.");
    expect(html).not.toContain("Admin setup required");
    for (const href of ADMIN_HREFS) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("links every admin tool and the health check from the dashboard", async () => {
    const html = renderToStaticMarkup(await AdminHomePage());

    for (const href of ADMIN_HREFS) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('href="/api/health"');
    expect(html).toContain("Health check / 상태 점검");
    expect(html).toContain("Operational health / 운영 상태");
  });

  it("stays admin-only and skips queue reads when the guard rejects", async () => {
    mockRequireRole.mockRejectedValueOnce(new Error("REDIRECT:/forbidden"));

    await expect(AdminHomePage()).rejects.toThrow("REDIRECT:/forbidden");
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin");
    expect(mockCounts).not.toHaveBeenCalled();
    expect(mockPendingCount).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("renders recent audit activity with calm empty and error fallbacks", async () => {
    mockAudit.mockResolvedValue({
      status: "ok",
      entries: [
        {
          id: "log-1",
          action: "job.approve",
          entityType: "job",
          createdAt: "2026-07-01T00:00:00Z",
        },
      ],
    });
    let html = renderToStaticMarkup(await AdminHomePage());
    expect(html).toContain("job.approve");
    // ko-KR medium date; day shifts with the runner's timezone, year doesn't.
    expect(html).toMatch(/2026\. \d{1,2}\. \d{1,2}\./);

    mockAudit.mockResolvedValue({ status: "ok", entries: [] });
    html = renderToStaticMarkup(await AdminHomePage());
    expect(html).toContain("아직 기록된 활동이 없습니다.");

    mockAudit.mockResolvedValue({ status: "error" });
    html = renderToStaticMarkup(await AdminHomePage());
    expect(html).toContain("활동 기록을 불러오지 못했습니다");
    expect(html).toContain(">2<");
  });

  it("never leaks env values into rendered output", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://leak-canary.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_leak_canary_000000");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_leak_canary_000000");
    const sentinels = [
      "https://leak-canary.supabase.co",
      "sb_publishable_leak_canary_000000",
      "sb_secret_leak_canary_000000",
    ];

    const okHtml = renderToStaticMarkup(await AdminHomePage());
    useUnconfiguredQueues();
    const setupHtml = renderToStaticMarkup(await AdminHomePage());

    for (const value of sentinels) {
      expect(okHtml).not.toContain(value);
      expect(setupHtml).not.toContain(value);
    }
  });
});

describe("admin dashboard static security boundaries", () => {
  it("keeps the audit read narrow and free of privileged clients", () => {
    const auditSource = read("src/lib/db/audit-logs.ts");
    expect(auditSource).toContain('.select("id, action, entity_type, created_at")');
    expect(auditSource).not.toMatch(/metadata/);
    expect(auditSource).not.toMatch(/service.?role/i);
  });

  it("keeps the dashboard page off process.env", () => {
    const pageSource = read("src/app/admin/page.tsx");
    expect(pageSource).not.toMatch(/process\.env/);
  });
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}
