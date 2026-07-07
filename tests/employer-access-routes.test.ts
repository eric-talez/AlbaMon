import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/employer-access-requests", () => ({
  createEmployerAccessRequest: vi.fn(),
  getLatestEmployerAccessRequest: vi.fn(),
  getAdminEmployerAccessRequests: vi.fn(),
  getPendingEmployerAccessRequestCount: vi.fn(),
  reviewEmployerAccessRequest: vi.fn(),
}));
vi.mock("@/lib/db/admin-moderation", () => ({
  getAdminQueueCounts: vi.fn(),
}));
vi.mock("@/components/auth/AccountBar", () => ({
  AccountBar: () => null,
}));

import { requireRole, requireUser } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getAdminEmployerAccessRequests,
  getLatestEmployerAccessRequest,
  getPendingEmployerAccessRequestCount,
  type AdminEmployerAccessRequest,
  type EmployerAccessRequestSummary,
} from "@/lib/db/employer-access-requests";
import { getAdminQueueCounts } from "@/lib/db/admin-moderation";
import EmployerRequestAccessPage from "@/app/(employer-access)/employer/request-access/page";
import AdminEmployerRequestsPage from "@/app/admin/employer-requests/page";
import AdminHomePage from "@/app/admin/page";
import ForbiddenPage from "@/app/forbidden/page";
import DashboardPage from "@/app/dashboard/page";

const mockRequireUser = vi.mocked(requireUser);
const mockRequireRole = vi.mocked(requireRole);
const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockLatest = vi.mocked(getLatestEmployerAccessRequest);
const mockAdminRequests = vi.mocked(getAdminEmployerAccessRequests);
const mockPendingCount = vi.mocked(getPendingEmployerAccessRequestCount);
const mockCounts = vi.mocked(getAdminQueueCounts);

function user(role: "seeker" | "employer" | "admin") {
  return {
    id: `${role}-1`,
    email: `${role}@example.com`,
    role,
    isDev: false,
  };
}

function summary(
  overrides: Partial<EmployerAccessRequestSummary> = {},
): EmployerAccessRequestSummary {
  return {
    id: "req-1",
    businessName: "K-Work Cafe",
    city: "Los Angeles",
    state: "CA",
    status: "pending",
    createdAt: "2026-07-06T00:00:00Z",
    reviewedAt: null,
    ...overrides,
  };
}

function adminRequest(
  overrides: Partial<AdminEmployerAccessRequest> = {},
): AdminEmployerAccessRequest {
  return {
    id: "req-1",
    businessName: "K-Work Cafe",
    contactName: "Eric Kim",
    phone: "213-555-0100",
    website: "https://kworkcafe.example",
    city: "Los Angeles",
    state: "CA",
    reason: "We are hiring baristas.",
    status: "pending",
    requesterDisplayName: "Eric",
    requesterEmail: "seeker@example.com",
    createdAt: "2026-07-06T00:00:00Z",
    reviewedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue(user("seeker"));
  mockRequireRole.mockResolvedValue(user("admin"));
  mockGetCurrentUser.mockResolvedValue(user("seeker"));
  mockLatest.mockResolvedValue({ status: "ok", request: null });
  mockAdminRequests.mockResolvedValue({ status: "ok", requests: [] });
  mockPendingCount.mockResolvedValue({ status: "ok", count: 4 });
  mockCounts.mockResolvedValue({
    pendingJobs: { status: "ok", count: 2 },
    unverifiedCompanies: { status: "ok", count: 1 },
    openReports: { status: "ok", count: 3 },
  });
});

afterEach(() => vi.clearAllMocks());

describe("/employer/request-access", () => {
  it("guards with requireUser so signed-out visitors bounce to login with next", async () => {
    await EmployerRequestAccessPage();
    expect(mockRequireUser).toHaveBeenCalledWith("/employer/request-access");
  });

  it("shows a seeker the request form with the required review disclaimers", async () => {
    const html = renderToStaticMarkup(await EmployerRequestAccessPage());
    for (const field of [
      "businessName",
      "contactName",
      "phone",
      "website",
      "city",
      "state",
      "reason",
    ]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain("Admin review is required before you can post jobs");
    expect(html).toContain("does not guarantee approval");
    expect(html).toContain(
      "does not verify or guarantee business registration, legal status, or work authorization",
    );
  });

  it("tells employers and admins they already have access instead of a form", async () => {
    for (const role of ["employer", "admin"] as const) {
      mockRequireUser.mockResolvedValue(user(role));
      const html = renderToStaticMarkup(await EmployerRequestAccessPage());
      expect(html).toContain("이미 고용주 기능을 사용할 수 있습니다");
      expect(html).toContain('href="/employer"');
      expect(html).not.toContain('name="businessName"');
      expect(mockLatest).not.toHaveBeenCalled();
    }
  });

  it("shows the pending state without a resubmit form", async () => {
    mockLatest.mockResolvedValue({ status: "ok", request: summary() });
    const html = renderToStaticMarkup(await EmployerRequestAccessPage());
    expect(html).toContain("요청이 검토 대기 중입니다");
    expect(html).not.toContain('name="businessName"');
  });

  it("shows the rejected state and allows a new submission", async () => {
    mockLatest.mockResolvedValue({
      status: "ok",
      request: summary({ status: "rejected", reviewedAt: "2026-07-06T01:00:00Z" }),
    });
    const html = renderToStaticMarkup(await EmployerRequestAccessPage());
    expect(html).toContain("이전 요청이 반려되었습니다");
    expect(html).toContain('name="businessName"');
  });

  it("shows a setup-required state instead of the form when Supabase is unconfigured", async () => {
    mockLatest.mockResolvedValue({ status: "unavailable" });
    const html = renderToStaticMarkup(await EmployerRequestAccessPage());
    expect(html).toContain("Supabase가 연결된 환경");
    expect(html).not.toContain('name="businessName"');
  });
});

describe("/admin/employer-requests", () => {
  it("guards with the exact admin role and renders the queue details", async () => {
    mockAdminRequests.mockResolvedValue({
      status: "ok",
      requests: [
        adminRequest(),
        adminRequest({
          id: "req-2",
          businessName: "Han Market",
          status: "approved",
          reviewedAt: "2026-07-05T00:00:00Z",
        }),
      ],
    });

    const html = renderToStaticMarkup(await AdminEmployerRequestsPage());
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/employer-requests");
    expect(html).toContain("K-Work Cafe");
    expect(html).toContain("Han Market");
    expect(html).toContain("seeker@example.com");
    expect(html).toContain("We are hiring baristas.");
    expect(html).toContain("승인 (고용주 전환)");
    expect(html).toContain("반려");
    // Only the already-reviewed card's two buttons render disabled.
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });

  it("explains the empty and unavailable queue states", async () => {
    let html = renderToStaticMarkup(await AdminEmployerRequestsPage());
    expect(html).toContain("접수된 요청이 없습니다");

    mockAdminRequests.mockResolvedValue({ status: "unavailable" });
    html = renderToStaticMarkup(await AdminEmployerRequestsPage());
    expect(html).toContain("Supabase가 연결된 환경에서만");
  });
});

describe("employer access entry points", () => {
  it("adds a pending-request card to the admin dashboard", async () => {
    const html = renderToStaticMarkup(await AdminHomePage());
    expect(html).toContain('href="/admin/employer-requests"');
    expect(html).toContain("Employer requests / 고용주 권한 요청");
    expect(html).toContain(">4<");
  });

  it("offers seekers the request-access CTA on /forbidden", async () => {
    let html = renderToStaticMarkup(await ForbiddenPage());
    expect(html).toContain('href="/employer/request-access"');

    mockGetCurrentUser.mockResolvedValue(user("employer"));
    html = renderToStaticMarkup(await ForbiddenPage());
    expect(html).not.toContain('href="/employer/request-access"');
  });

  it("offers seekers the request-access card on the dashboard", async () => {
    let html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('href="/employer/request-access"');

    mockRequireUser.mockResolvedValue(user("employer"));
    html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain('href="/employer/request-access"');
  });

  it("routes seekers from the employer area to the request flow via the layout guard", () => {
    const layout = readFileSync(
      join(process.cwd(), "src", "app", "employer", "layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("requireEmployerAreaAccess");

    // The request page must live OUTSIDE the guarded employer layout (route
    // group) or seekers could never reach it.
    const page = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "(employer-access)",
        "employer",
        "request-access",
        "page.tsx",
      ),
      "utf8",
    );
    expect(page).toContain("requireUser");
  });

  it("keeps the user-facing request flow on the caller session — no service role, no mock writes", () => {
    for (const path of [
      "src/lib/db/employer-access-requests.ts",
      "src/lib/employer-access/actions.ts",
      "src/lib/employer-access/validation.ts",
      "src/app/(employer-access)/employer/request-access/actions.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
      expect(source).not.toMatch(/supabase\/service|service_role|SERVICE_ROLE/);
      expect(source).not.toMatch(/@\/lib\/mock/);
    }
    const db = readFileSync(
      join(process.cwd(), "src", "lib", "db", "employer-access-requests.ts"),
      "utf8",
    );
    expect(db).toContain("createSupabaseServerClient");
  });
});
