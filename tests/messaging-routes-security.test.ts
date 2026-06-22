import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/messages", () => ({
  getApplicationThread: vi.fn(),
  sendApplicationMessage: vi.fn(),
}));

import { requireRole } from "@/lib/auth/guards";
import { getApplicationThread } from "@/lib/db/messages";
import SeekerApplicationMessagesPage from "@/app/dashboard/applications/[applicationId]/messages/page";
import EmployerApplicationMessagesPage from "@/app/employer/applications/[applicationId]/messages/page";

const mockRequireRole = vi.mocked(requireRole);
const mockThread = vi.mocked(getApplicationThread);
const applicationId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mockRequireRole.mockImplementation(async (role) => ({
    id: `${role}-1`,
    email: `${role}@example.com`,
    role,
    isDev: false,
  }));
  mockThread.mockResolvedValue({
    status: "ok",
    thread: {
      applicationId,
      jobId: "job-1",
      jobTitle: "Server",
      companyName: "K-Work Cafe",
      applicationStatus: "submitted",
      messages: [
        { id: "message-1", senderId: "seeker-1", body: "Interview question", createdAt: "2026-06-21T10:00:00Z", isOwn: true },
        { id: "message-2", senderId: "employer-1", body: "Thanks for asking", createdAt: "2026-06-21T11:00:00Z", isOwn: false },
      ],
    },
  });
});

afterEach(() => vi.clearAllMocks());

describe("application message routes", () => {
  it("uses exact seeker and employer guards and maps ownership locally", async () => {
    const seekerHtml = renderToStaticMarkup(await SeekerApplicationMessagesPage({
      params: Promise.resolve({ applicationId }),
    }));
    expect(mockRequireRole).toHaveBeenCalledWith(
      "seeker",
      `/dashboard/applications/${applicationId}/messages`,
    );
    expect(mockThread).toHaveBeenCalledWith(applicationId, "seeker-1");
    expect(seekerHtml).toContain("Interview question");
    expect(seekerHtml).toContain("Thanks for asking");

    await EmployerApplicationMessagesPage({ params: Promise.resolve({ applicationId }) });
    expect(mockRequireRole).toHaveBeenCalledWith(
      "employer",
      `/employer/applications/${applicationId}/messages`,
    );
    expect(mockThread).toHaveBeenCalledWith(applicationId, "employer-1");
  });

  it("renders empty and unavailable states without mock messages", async () => {
    mockThread.mockResolvedValueOnce({
      status: "ok",
      thread: {
        applicationId,
        jobId: "job-1",
        jobTitle: "Server",
        companyName: "K-Work Cafe",
        applicationStatus: "submitted",
        messages: [],
      },
    });
    const empty = renderToStaticMarkup(await SeekerApplicationMessagesPage({
      params: Promise.resolve({ applicationId }),
    }));
    expect(empty).toContain("아직 메시지가 없습니다.");

    mockThread.mockResolvedValueOnce({ status: "unavailable" });
    const unavailable = renderToStaticMarkup(await EmployerApplicationMessagesPage({
      params: Promise.resolve({ applicationId }),
    }));
    expect(unavailable).toContain("Supabase가 연결된 환경");
    expect(unavailable).not.toContain("Interview question");
  });

  it("links every seeker and employer application to its thread", () => {
    const seeker = read("src/app/dashboard/applications/page.tsx");
    const employer = read("src/app/employer/applications/page.tsx");
    expect(seeker).toContain("/dashboard/applications/${encodeURIComponent(application.id)}/messages");
    expect(employer).toContain("/employer/applications/${encodeURIComponent(application.id)}/messages");
  });
});

describe("message migration security", () => {
  const sql = read("supabase/migrations/20260626000000_application_messages.sql");

  it("creates a bounded application message table with RLS", () => {
    expect(sql).toMatch(/create\s+table\s+public\.messages/i);
    expect(sql).toMatch(/application_id\s+uuid\s+not\s+null\s+references\s+public\.applications/i);
    expect(sql).toMatch(/sender_id\s+uuid\s+not\s+null\s+references\s+public\.profiles/i);
    expect(sql).toMatch(/char_length\(btrim\(body\)\)\s*>\s*0/i);
    expect(sql).toMatch(/char_length\(body\)\s*<=\s*2000/i);
    expect(sql).toMatch(/alter\s+table\s+public\.messages\s+enable\s+row\s+level\s+security/i);
  });

  it("limits thread access to applicant, owning employer, or admin", () => {
    const access = sql.match(
      /function\s+public\.can_access_application_thread[\s\S]*?\$\$;/i,
    )?.[0];
    expect(access).toBeTruthy();
    expect(access).toMatch(/security\s+definer/i);
    expect(access).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(access).toMatch(/a\.seeker_id\s*=\s*auth\.uid\(\)/i);
    expect(access).toMatch(/c\.owner_id\s*=\s*auth\.uid\(\)/i);
    expect(access).toMatch(/current_profile_role\(\)\s*=\s*'admin'/i);
  });

  it("allows only seeker/employer participants to send as themselves", () => {
    const insert = sql.match(
      /create\s+policy\s+messages_insert_participants[\s\S]*?;/i,
    )?.[0];
    expect(insert).toMatch(/sender_id\s*=\s*auth\.uid\(\)/i);
    expect(insert).toMatch(/current_profile_role\(\)\s+in\s*\(\s*'seeker',\s*'employer'\s*\)/i);
    expect(insert).toMatch(/can_access_application_thread\(application_id\)/i);
    expect(sql).not.toMatch(/create\s+policy\s+\w+\s+on\s+public\.messages\s+for\s+(?:update|delete)/i);
  });

  it("revokes broad privileges and grants only authenticated read/send access", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.messages\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+select,\s*insert\s+on\s+table\s+public\.messages\s+to\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_application_thread_context\(uuid\)/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_application_thread_context\(uuid\)\s+to\s+authenticated/i);
  });
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}
