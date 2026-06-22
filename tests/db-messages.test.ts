import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getApplicationThread,
  sendApplicationMessage,
} from "@/lib/db/messages";

const mockClient = vi.mocked(createSupabaseServerClient);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("application message reads", () => {
  it("loads caller-bound context and maps ordered messages", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        application_id: "application-1",
        job_id: "job-1",
        job_title: "Server",
        company_name: "K-Work Cafe",
        application_status: "submitted",
      }],
      error: null,
    });
    const finalOrder = vi.fn().mockResolvedValue({
      data: [
        { id: "message-1", application_id: "application-1", sender_id: "seeker-1", body: "Hello", created_at: "2026-06-21T10:00:00Z" },
        { id: "message-2", application_id: "application-1", sender_id: "employer-1", body: "Welcome", created_at: "2026-06-21T11:00:00Z" },
      ],
      error: null,
    });
    const firstOrder = vi.fn(() => ({ order: finalOrder }));
    const eq = vi.fn(() => ({ order: firstOrder }));
    const select = vi.fn(() => ({ eq }));
    mockClient.mockResolvedValue({ rpc, from: vi.fn(() => ({ select })) } as never);

    await expect(getApplicationThread("application-1", "seeker-1")).resolves.toEqual({
      status: "ok",
      thread: {
        applicationId: "application-1",
        jobId: "job-1",
        jobTitle: "Server",
        companyName: "K-Work Cafe",
        applicationStatus: "submitted",
        messages: [
          { id: "message-1", senderId: "seeker-1", body: "Hello", createdAt: "2026-06-21T10:00:00Z", isOwn: true },
          { id: "message-2", senderId: "employer-1", body: "Welcome", createdAt: "2026-06-21T11:00:00Z", isOwn: false },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_application_thread_context", {
      target_application_id: "application-1",
    });
    expect(eq).toHaveBeenCalledWith("application_id", "application-1");
    expect(firstOrder).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(finalOrder).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("fails closed when the context RPC returns no accessible application", async () => {
    const from = vi.fn();
    mockClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from,
    } as never);
    await expect(getApplicationThread("other", "seeker-1")).resolves.toEqual({
      status: "not_allowed",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns unavailable without querying", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    await expect(getApplicationThread("application-1", "seeker-1")).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("application message writes", () => {
  it("inserts only the application, authenticated sender, and body", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "message-1" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mockClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) } as never);

    await expect(sendApplicationMessage("application-1", "seeker-1", "Hello")).resolves.toEqual({
      status: "sent",
      messageId: "message-1",
    });
    expect(insert).toHaveBeenCalledWith({
      application_id: "application-1",
      sender_id: "seeker-1",
      body: "Hello",
    });
  });

  it("maps RLS/check failures safely", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) })),
    } as never);
    await expect(sendApplicationMessage("application-1", "intruder", "Hello")).resolves.toEqual({
      status: "not_allowed",
    });
  });
});
