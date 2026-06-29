import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(),
}));
vi.mock("@/lib/db/applications", () => ({
  getSeekerApplications: vi.fn(),
  getEmployerApplications: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import {
  getEmployerApplications,
  getSeekerApplications,
} from "@/lib/db/applications";
import SeekerApplicationsPage from "@/app/dashboard/applications/page";
import EmployerApplicationsPage from "@/app/employer/applications/page";

const mockRequireRole = vi.mocked(requireRole);
const mockSeekerApplications = vi.mocked(getSeekerApplications);
const mockEmployerApplications = vi.mocked(getEmployerApplications);

beforeEach(() => {
  mockRequireRole.mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "seeker",
    isDev: false,
  });
  mockSeekerApplications.mockResolvedValue({ status: "ok", applications: [] });
  mockEmployerApplications.mockResolvedValue({ status: "ok", applications: [] });
});

afterEach(() => vi.clearAllMocks());

describe("application dashboard access and states", () => {
  it("uses exact runtime-role guards for both routes", async () => {
    await SeekerApplicationsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("seeker", "/dashboard/applications");

    await EmployerApplicationsPage();
    expect(mockRequireRole).toHaveBeenCalledWith("employer", "/employer/applications");
  });

  it.each([
    ["unavailable", "지원 내역을 사용할 수 없습니다."],
    ["error", "지원 내역을 불러오지 못했습니다."],
  ] as const)("renders the seeker %s state distinctly", async (status, text) => {
    mockSeekerApplications.mockResolvedValue({ status });
    const html = renderToStaticMarkup(await SeekerApplicationsPage());
    expect(html).toContain(text);
  });

  it("renders seeker data, cover note, and only public job links", async () => {
    mockSeekerApplications.mockResolvedValue({
      status: "ok",
      applications: [
        {
          id: "a-1",
          jobId: "job-public",
          jobTitle: "Server",
          companyName: "K-Work Cafe",
          city: "Los Angeles",
          state: "CA",
          status: "submitted",
          coverNote: "반갑습니다",
          submittedAt: "2026-06-21T12:00:00.000Z",
          jobIsPublic: true,
        },
        {
          id: "a-2",
          jobId: "job-private",
          jobTitle: "Cashier",
          companyName: "OC Market",
          city: "Irvine",
          state: "CA",
          status: "submitted",
          coverNote: null,
          submittedAt: "2026-06-20T12:00:00.000Z",
          jobIsPublic: false,
        },
      ],
    });

    const html = renderToStaticMarkup(await SeekerApplicationsPage());
    expect(html).toContain("반갑습니다");
    expect(html).toContain('/jobs/job-public');
    expect(html).not.toContain('/jobs/job-private');
    expect(html).toContain("현재 공개되지 않은 공고입니다.");
  });

  it("renders only the limited employer identity with safe null fallbacks", async () => {
    mockEmployerApplications.mockResolvedValue({
      status: "ok",
      applications: [
        {
          id: "a-3",
          jobId: "job-3",
          jobTitle: "Assistant",
          companyName: "LA Office",
          applicantDisplayName: null,
          applicantEmail: null,
          status: "submitted",
          coverNote: null,
          submittedAt: "2026-06-21T12:00:00.000Z",
          jobIsPublic: true,
        },
      ],
    });

    const html = renderToStaticMarkup(await EmployerApplicationsPage());
    expect(html).toContain("이름 미입력");
    expect(html).toContain("이메일 없음");
    expect(html).not.toMatch(/phone|address|metadata/i);
  });

  it.each([
    ["unavailable", "지원자 목록을 사용할 수 없습니다."],
    ["error", "지원자 목록을 불러오지 못했습니다."],
  ] as const)("renders the employer %s state distinctly", async (status, text) => {
    mockEmployerApplications.mockResolvedValue({ status });
    const html = renderToStaticMarkup(await EmployerApplicationsPage());
    expect(html).toContain(text);
  });

  it("gives the employer a status control with every supported status option", async () => {
    mockEmployerApplications.mockResolvedValue({
      status: "ok",
      applications: [
        {
          id: "a-4",
          jobId: "job-4",
          jobTitle: "Barista",
          companyName: "K-Work Cafe",
          applicantDisplayName: "지원자",
          applicantEmail: "seeker@example.com",
          status: "submitted",
          coverNote: null,
          submittedAt: "2026-06-21T12:00:00.000Z",
          jobIsPublic: true,
        },
      ],
    });

    const html = renderToStaticMarkup(await EmployerApplicationsPage());
    expect(html).toContain("지원 상태 변경");
    expect(html).toContain('name="status"');
    for (const value of [
      "submitted",
      "reviewing",
      "interview",
      "offered",
      "rejected",
      "withdrawn",
    ]) {
      expect(html).toContain(`value="${value}"`);
    }
  });

  it("shows the seeker a friendly label for an employer-updated status", async () => {
    mockSeekerApplications.mockResolvedValue({
      status: "ok",
      applications: [
        {
          id: "a-5",
          jobId: "job-5",
          jobTitle: "Server",
          companyName: "K-Work Cafe",
          city: "Los Angeles",
          state: "CA",
          status: "interview",
          coverNote: null,
          submittedAt: "2026-06-21T12:00:00.000Z",
          jobIsPublic: true,
        },
      ],
    });

    const html = renderToStaticMarkup(await SeekerApplicationsPage());
    expect(html).toContain("면접");
  });

  it("links both dashboard entry points to their application routes", () => {
    const seekerDashboard = readFileSync(
      join(process.cwd(), "src", "app", "dashboard", "page.tsx"),
      "utf8",
    );
    const employerDashboard = readFileSync(
      join(process.cwd(), "src", "app", "employer", "page.tsx"),
      "utf8",
    );
    expect(seekerDashboard).toContain('href="/dashboard/applications"');
    expect(employerDashboard).toContain('href: "/employer/applications"');
    expect(employerDashboard).toContain('user.role === "employer"');
  });
});
