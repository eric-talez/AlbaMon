import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/applications", () => ({ updateApplicationStatus: vi.fn() }));
vi.mock("@/lib/notifications/dev", () => ({
  notifyApplicationStatusChanged: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { updateApplicationStatus } from "@/lib/db/applications";
import { notifyApplicationStatusChanged } from "@/lib/notifications/dev";
import { updateEmployerApplicationStatus } from "@/app/employer/applications/actions";

const mockRequireRole = vi.mocked(requireRole);
const mockUpdate = vi.mocked(updateApplicationStatus);
const mockNotify = vi.mocked(notifyApplicationStatusChanged);
const applicationId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle", message: "" } as const;

beforeEach(() => {
  mockRequireRole.mockImplementation(async (role) => ({
    id: `${role}-1`,
    email: `${role}@example.com`,
    role,
    isDev: false,
  }));
  mockUpdate.mockResolvedValue({
    status: "updated",
    previousStatus: "submitted",
    nextStatus: "interview",
  });
});

afterEach(() => vi.clearAllMocks());

function form(status = "interview", id = applicationId): FormData {
  const data = new FormData();
  data.set("applicationId", id);
  data.set("status", status);
  // A forged status-internal field must never influence the trusted write.
  data.set("seeker_id", "forged-seeker");
  return data;
}

describe("employer application status action", () => {
  it("reauthenticates the exact employer role, updates, notifies, and refreshes both views", async () => {
    const result = await updateEmployerApplicationStatus(idle, form());

    expect(mockRequireRole).toHaveBeenCalledWith(
      "employer",
      "/employer/applications",
    );
    expect(mockUpdate).toHaveBeenCalledWith(applicationId, "interview");
    expect(mockNotify).toHaveBeenCalledWith(
      applicationId,
      "submitted",
      "interview",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/employer/applications");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/applications");
    expect(result.status).toBe("success");
    expect(result.message).toContain("면접");
  });

  it("rejects an unsupported status before any database write", async () => {
    const result = await updateEmployerApplicationStatus(idle, form("archived"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("지원하지 않는 상태입니다.");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rejects a malformed application id before any database write", async () => {
    const result = await updateEmployerApplicationStatus(
      idle,
      form("interview", "not-a-uuid"),
    );
    expect(result.status).toBe("error");
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("blocks non-employer callers before any database write", async () => {
    mockRequireRole.mockRejectedValueOnce(new Error("REDIRECT:/forbidden"));

    await expect(updateEmployerApplicationStatus(idle, form())).rejects.toThrow(
      "REDIRECT:/forbidden",
    );
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("notifies only after a successful update — not on an authorization failure", async () => {
    mockUpdate.mockResolvedValueOnce({ status: "not_allowed" });
    const result = await updateEmployerApplicationStatus(idle, form());
    expect(result.status).toBe("error");
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("keeps a successful update successful even if the notification throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockNotify.mockImplementationOnce(() => {
      throw new Error("notification transport down");
    });
    const result = await updateEmployerApplicationStatus(idle, form());
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/applications");
  });

  it("returns safe user-facing messages that never leak RLS or Postgres detail", async () => {
    mockUpdate.mockResolvedValueOnce({ status: "not_allowed" });
    const forbidden = await updateEmployerApplicationStatus(idle, form());
    expect(forbidden.message).not.toMatch(/42501|postgres|rls|policy/i);
    expect(forbidden.message).toBe("이 지원서의 상태를 변경할 권한이 없습니다.");

    mockUpdate.mockResolvedValueOnce({ status: "not_found" });
    const missing = await updateEmployerApplicationStatus(idle, form());
    expect(missing.message).toBe("이 지원서의 상태를 변경할 권한이 없습니다.");

    mockUpdate.mockResolvedValueOnce({ status: "error" });
    const failed = await updateEmployerApplicationStatus(idle, form());
    expect(failed.status).toBe("error");
    expect(failed.message).not.toMatch(/database|private|postgres/i);

    mockUpdate.mockResolvedValueOnce({ status: "unavailable" });
    const unavailable = await updateEmployerApplicationStatus(idle, form());
    expect(unavailable.message).toContain("Supabase");
  });
});
