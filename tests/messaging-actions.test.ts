import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", async (original) => ({ ...await original<object>(), requireUser: vi.fn() }));
vi.mock("@/lib/db/messages", () => ({ sendApplicationMessage: vi.fn() }));
vi.mock("@/lib/notifications/dev", () => ({ notifyNewMessage: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { sendApplicationMessage } from "@/lib/db/messages";
import { notifyNewMessage } from "@/lib/notifications/dev";
import { sendSeekerApplicationMessage } from "@/app/dashboard/applications/[applicationId]/messages/actions";
import { sendEmployerApplicationMessage } from "@/app/employer/applications/[applicationId]/messages/actions";

const mockRequireUser = vi.mocked(requireUser);
const mockSend = vi.mocked(sendApplicationMessage);
const mockNotify = vi.mocked(notifyNewMessage);
const applicationId = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle", message: "" } as const;

beforeEach(() => {
  mockRequireUser.mockResolvedValue({id:"promoted-1",email:"user@example.com",role:"employer",isDev:false,aal:"aal1",accountStatus:"active",displayName:null});
  mockSend.mockResolvedValue({ status: "sent", messageId: "message-1", recipientId:"owner-1", recipientSide:"employer" });
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
  it("reauthenticates a promoted applicant, derives sender identity, notifies, and refreshes both views", async () => {
    const result = await sendSeekerApplicationMessage(idle, form());
    expect(mockRequireUser).toHaveBeenCalledWith(
      "/dashboard/applications",
    );
    expect(mockSend).toHaveBeenCalledWith(applicationId, "promoted-1", "Hello");
    expect(mockNotify).toHaveBeenCalledWith(applicationId, "message-1", "owner-1", "employer");
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/applications/${applicationId}/messages`);
    expect(revalidatePath).toHaveBeenCalledWith(`/employer/applications/${applicationId}/messages`);
    expect(result.status).toBe("success");
  });

  it("uses the same caller-bound action from the employer route", async () => {
    await sendEmployerApplicationMessage(idle, form("Reply"));
    expect(mockRequireUser).toHaveBeenCalledWith(
      "/dashboard/applications",
    );
    expect(mockSend).toHaveBeenCalledWith(applicationId, "promoted-1", "Reply");
    expect(mockNotify).toHaveBeenCalledWith(applicationId, "message-1", "owner-1", "employer");
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
