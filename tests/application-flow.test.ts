import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/jobs", () => ({ getApprovedJobById: vi.fn() }));
vi.mock("@/lib/db/applications", () => ({ createApplication: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: vi.fn() }));

import { requireUser } from "@/lib/auth/guards";
import { getApprovedJobById } from "@/lib/db/jobs";
import { createApplication } from "@/lib/db/applications";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { submitApplication } from "@/app/(public)/jobs/[id]/apply/actions";

const mockRequireUser = vi.mocked(requireUser);
const mockGetJob = vi.mocked(getApprovedJobById);
const mockCreate = vi.mocked(createApplication);
const mockConfigured = vi.mocked(isSupabaseConfigured);
const idle = { status: "idle", message: "" } as const;

function form(note: string): FormData {
  const data = new FormData();
  data.set("coverNote", note);
  return data;
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue({
    id: "seeker-1",
    email: "s@example.com",
    role: "seeker",
    isDev: false,
  });
  mockConfigured.mockReturnValue(true);
  // Only truthiness matters to the action.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetJob.mockResolvedValue({ id: "job-1" } as any);
  mockCreate.mockResolvedValue("created");
});

afterEach(() => vi.clearAllMocks());

describe("submitApplication", () => {
  it("reauthenticates with the preserved apply destination", async () => {
    await submitApplication("job/unsafe", idle, form("Hello"));
    expect(mockRequireUser).toHaveBeenCalledWith("/jobs/job%2Funsafe/apply");
  });

  it("normalizes blank notes to null and returns success", async () => {
    const state = await submitApplication("job-1", idle, form("   "));
    expect(mockCreate).toHaveBeenCalledWith("job-1", "seeker-1", null);
    expect(state.status).toBe("success");
  });

  it("rejects notes over 1,000 characters before reading or writing", async () => {
    const state = await submitApplication("job-1", idle, form("a".repeat(1001)));
    expect(state.status).toBe("error");
    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each(["employer", "admin"] as const)("blocks the %s role", async (role) => {
    mockRequireUser.mockResolvedValue({
      id: `${role}-1`,
      email: `${role}@example.com`,
      role,
      isDev: false,
    });
    const state = await submitApplication("job-1", idle, form(""));
    expect(state.status).toBe("error");
    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("propagates the auth guard redirect for missing users/profiles", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    mockRequireUser.mockRejectedValue(redirect);
    await expect(submitApplication("job-1", idle, form(""))).rejects.toBe(
      redirect,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks missing or non-approved jobs", async () => {
    mockGetJob.mockResolvedValue(undefined);
    const state = await submitApplication("job-1", idle, form(""));
    expect(state.status).toBe("error");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns graceful duplicate confirmation", async () => {
    mockCreate.mockResolvedValue("duplicate");
    const state = await submitApplication("job-1", idle, form("Hello"));
    expect(state.status).toBe("duplicate");
  });

  it("does not attempt a write when Supabase is unconfigured", async () => {
    mockConfigured.mockReturnValue(false);
    const state = await submitApplication("job-1", idle, form(""));
    expect(state.status).toBe("error");
    expect(mockGetJob).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("application route wiring", () => {
  const detail = readFileSync(
    join(process.cwd(), "src", "app", "(public)", "jobs", "[id]", "page.tsx"),
    "utf8",
  );
  const applyPage = readFileSync(
    join(
      process.cwd(),
      "src",
      "app",
      "(public)",
      "jobs",
      "[id]",
      "apply",
      "page.tsx",
    ),
    "utf8",
  );

  it("links job detail to the application route", () => {
    expect(detail).toContain("/apply`");
    expect(detail).toContain("지원하기 (Apply)");
  });

  it("uses the approved-only job lookup and server auth guard", () => {
    expect(applyPage).toContain("getApprovedJobById(id)");
    expect(applyPage).toContain("requireUser(applyPath)");
  });
});
