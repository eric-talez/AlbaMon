import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/messages", () => ({ sendApplicationMessage: vi.fn() }));
vi.mock("@/lib/notifications/dev", () => ({ notifyNewMessage: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { sendApplicationMessage } from "@/lib/db/messages";
import { notifyNewMessage } from "@/lib/notifications/dev";
import { sendSeekerApplicationMessage } from "@/app/dashboard/applications/[applicationId]/messages/actions";
import { sendEmployerApplicationMessage } from "@/app/employer/applications/[applicationId]/messages/actions";

const mockRequireRole = vi.mocked(requireRole);
const mockSend = vi.mocked(sendApplicationMessage);
const mockNotify = vi.mocked(notifyNewMessage);
const applicationId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle", message: "" } as const;

beforeEach(() => {
  mockRequireRole.mockImplementation(async (role) => ({
    id: `${role}-1`,
    email: `${role}@example.com`,
    role,
    isDev: false,
  }));
  mockSend.mockResolvedValue({ status: "sent", messageId: "message-1" });
});

afterEach(() => vi.clearAllMocks());

function form(body = " Hello ", id = applicationId): FormData {
  const data = new FormData();
  data.set("applicationId", id);
  data.set("body", body);
  data.set("sender_id", "forged-sender");
  return data;
}

describe("application message actions", () => {
  it("reauthenticates seeker, derives sender identity, notifies, and refreshes both views", async () => {
    const result = await sendSeekerApplicationMessage(idle, form());
    expect(mockRequireRole).toHaveBeenCalledWith(
      "seeker",
      `/dashboard/applications/${applicationId}/messages`,
    );
    expect(mockSend).toHaveBeenCalledWith(applicationId, "seeker-1", "Hello");
    expect(mockNotify).toHaveBeenCalledWith(applicationId, "message-1", "seeker");
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/applications/${applicationId}/messages`);
    expect(revalidatePath).toHaveBeenCalledWith(`/employer/applications/${applicationId}/messages`);
    expect(result.status).toBe("success");
  });

  it("uses the exact employer role and employer-derived sender", async () => {
    await sendEmployerApplicationMessage(idle, form("Reply"));
    expect(mockRequireRole).toHaveBeenCalledWith(
      "employer",
      `/employer/applications/${applicationId}/messages`,
    );
    expect(mockSend).toHaveBeenCalledWith(applicationId, "employer-1", "Reply");
    expect(mockNotify).toHaveBeenCalledWith(applicationId, "message-1", "employer");
  });

  it("rejects invalid IDs and blank or oversized bodies before writing", async () => {
    for (const invalid of [form("Hello", "bad-id"), form("   "), form("a".repeat(2001))]) {
      expect((await sendSeekerApplicationMessage(idle, invalid)).status).toBe("error");
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns safe authorization and database errors", async () => {
    mockSend.mockResolvedValueOnce({ status: "not_allowed" });
    const forbidden = await sendEmployerApplicationMessage(idle, form());
    expect(forbidden.message).not.toMatch(/42501|postgres|rls/i);

    mockSend.mockResolvedValueOnce({ status: "error" });
    const failed = await sendEmployerApplicationMessage(idle, form());
    expect(failed.message).not.toMatch(/private|database/i);
  });
});
