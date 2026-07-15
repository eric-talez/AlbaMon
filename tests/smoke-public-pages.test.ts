import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
}));

import { requireUser } from "@/lib/auth/guards";
import Home from "@/app/(public)/page";
import JobsPage from "@/app/(public)/jobs/page";
import JobDetailPage, {
  generateMetadata as generateJobMetadata,
} from "@/app/(public)/jobs/[id]/page";
import ApplyPage from "@/app/(public)/jobs/[id]/apply/page";
import ReportJobPage from "@/app/(public)/jobs/[id]/report/page";
import TermsPage from "@/app/(public)/terms/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import PostingPolicyPage from "@/app/(public)/posting-policy/page";
import WorkAuthorizationInfoPage from "@/app/(public)/work-authorization-info/page";
import { getMockJobs } from "@/lib/mock/jobs";

const mockRequireUser = vi.mocked(requireUser);
const approvedJob = getMockJobs()[0];

/**
 * Launch smoke tests: every public page renders end-to-end on the
 * deterministic mock-data path (Supabase unconfigured), guards fire with the
 * right redirect targets, and non-approved/unknown jobs 404. Browser E2E is
 * deferred — see docs/LAUNCH_CHECKLIST.md.
 */
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  mockRequireUser.mockResolvedValue({
    id: "user-1",
    email: "user@example.com",
    role: "seeker",
    isDev: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("homepage", () => {
  it("renders the brand heading, browse link, and informational disclaimer", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("<h1");
    expect(html).toContain("K-Work US");
    expect(html).toContain('href="/jobs"');
    expect(html).toContain("법률 자문이 아닙니다");
  });
});

describe("jobs browse page", () => {
  it("renders approved mock jobs with links and labeled filters", async () => {
    const html = renderToStaticMarkup(
      await JobsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("공고 둘러보기");
    expect(html).toContain(approvedJob.title);
    expect(html).toContain(`/jobs/${approvedJob.id}`);
    expect(html).toContain('aria-label="공고 필터"');
    // Explicit label association on the filter controls.
    expect(html).toContain('for="filter-q"');
    expect(html).toContain('id="filter-q"');
    // Expired / malformed-expiry approved jobs never reach the public list.
    expect(html).not.toContain("/jobs/kw-011");
    expect(html).not.toContain("/jobs/kw-012");
    expect(html).not.toContain("마감된 물류 창고");
  });
});

describe("job detail page", () => {
  it("renders an approved job with disclaimer and apply/report links", async () => {
    const html = renderToStaticMarkup(
      await JobDetailPage({ params: Promise.resolve({ id: approvedJob.id }) }),
    );
    expect(html).toContain(approvedJob.title);
    expect(html).toContain("근로 자격 및 고용 관련 법규 안내");
    expect(html).toContain(`/jobs/${approvedJob.id}/apply`);
    expect(html).toContain(`/jobs/${approvedJob.id}/report`);
  });

  it("404s for a job id that is not an approved listing", async () => {
    await expect(
      JobDetailPage({ params: Promise.resolve({ id: "kw-does-not-exist" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("404s for an approved-but-expired job, exactly like a non-public job", async () => {
    // kw-011 is approved but past its expiry; kw-012 is approved with a
    // malformed expiry. Both must resolve to the same 404 as an unknown id.
    await expect(
      JobDetailPage({ params: Promise.resolve({ id: "kw-011" }) }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      JobDetailPage({ params: Promise.resolve({ id: "kw-012" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("generates metadata only from the approved listing", async () => {
    const meta = await generateJobMetadata({
      params: Promise.resolve({ id: approvedJob.id }),
    });
    expect(meta.title).toContain(approvedJob.title);
    expect(meta.alternates?.canonical).toBe(`/jobs/${approvedJob.id}`);

    const missing = await generateJobMetadata({
      params: Promise.resolve({ id: "kw-does-not-exist" }),
    });
    expect(missing.title).toBe("공고를 찾을 수 없습니다");
    expect(missing.description).toBeUndefined();
  });
});

describe("apply flow guard", () => {
  it("authenticates with the apply path and stays fail-closed without Supabase", async () => {
    const html = renderToStaticMarkup(
      await ApplyPage({ params: Promise.resolve({ id: approvedJob.id }) }),
    );
    expect(mockRequireUser).toHaveBeenCalledWith(`/jobs/${approvedJob.id}/apply`);
    // Unconfigured environments must not fabricate submissions.
    expect(html).toContain("지원 기능을 사용할 수 없습니다");
  });

  it("propagates the login redirect when signed out", async () => {
    const applyPath = `/jobs/${approvedJob.id}/apply`;
    mockRequireUser.mockImplementation(async (next?: string) => {
      throw new Error(`REDIRECT:/login?next=${encodeURIComponent(next ?? "/")}`);
    });
    await expect(
      ApplyPage({ params: Promise.resolve({ id: approvedJob.id }) }),
    ).rejects.toThrow(`REDIRECT:/login?next=${encodeURIComponent(applyPath)}`);
  });

  it("blocks non-seeker accounts from the application form", async () => {
    mockRequireUser.mockResolvedValue({
      id: "emp-1",
      email: "employer@example.com",
      role: "employer",
      isDev: true,
    });
    const html = renderToStaticMarkup(
      await ApplyPage({ params: Promise.resolve({ id: approvedJob.id }) }),
    );
    expect(html).toContain("이 계정으로는 지원할 수 없습니다");
  });

  it("404s before authentication for unknown jobs", async () => {
    await expect(
      ApplyPage({ params: Promise.resolve({ id: "kw-does-not-exist" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mockRequireUser).not.toHaveBeenCalled();
  });
});

describe("report flow guard", () => {
  it("authenticates with the report path and renders the labeled form", async () => {
    const html = renderToStaticMarkup(
      await ReportJobPage({ params: Promise.resolve({ id: approvedJob.id }) }),
    );
    expect(mockRequireUser).toHaveBeenCalledWith(`/jobs/${approvedJob.id}/report`);
    expect(html).toContain(approvedJob.title);
    expect(html).toContain("not a legal determination");
    expect(html).toContain('for="reason"');
    expect(html).toContain('for="details"');
  });
});

describe("policy pages", () => {
  it.each([
    ["terms", TermsPage, "이용약관", "법률 검토"],
    ["privacy", PrivacyPage, "개인정보처리방침", "법률 검토"],
    ["posting-policy", PostingPolicyPage, "공고 등록 정책", "허용되지 않습니다"],
    [
      "work-authorization-info",
      WorkAuthorizationInfoPage,
      "근로자격 안내",
      "법률 자문이 아닙니다",
    ],
  ] as const)("renders /%s with an h1 and informational copy", (_route, Page, title, copy) => {
    const html = renderToStaticMarkup(Page());
    expect(html).toContain("<h1");
    expect(html).toContain(title);
    expect(html).toContain(copy);
  });
});
