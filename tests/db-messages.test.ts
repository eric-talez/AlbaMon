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
        participant_side: "applicant", recipient_id: "employer-1",
      }],
      error: null,
    });
    const range = vi.fn().mockResolvedValue({
      data: [
        { id: "message-2", application_id: "application-1", sender_id: "employer-1", body: "Welcome", created_at: "2026-06-21T11:00:00Z" },
        { id: "message-1", application_id: "application-1", sender_id: "seeker-1", body: "Hello", created_at: "2026-06-21T10:00:00Z" },
      ],
      error: null,
    });
    const finalOrder = vi.fn(() => ({ range }));
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
        participantSide: "applicant", hasOlder: false,
        messages: [
          { id: "message-1", senderId: "seeker-1", body: "Hello", createdAt: "2026-06-21T10:00:00Z", isOwn: true },
          { id: "message-2", senderId: "employer-1", body: "Welcome", createdAt: "2026-06-21T11:00:00Z", isOwn: false },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_application_thread_context", {
      target_application_id: "application-1",
    });
    expect(range).toHaveBeenCalledWith(0, 50);
    expect(eq).toHaveBeenCalledWith("application_id", "application-1");
    expect(firstOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(finalOrder).toHaveBeenCalledWith("id", { ascending: false });
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
    mockClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({data:[{participant_side:"applicant",recipient_id:"employer-1"}],error:null}), from: vi.fn(() => ({ insert })) } as never);

    await expect(sendApplicationMessage("application-1", "seeker-1", "Hello")).resolves.toEqual({
      status: "sent",
      messageId: "message-1", recipientId: "employer-1", recipientSide: "employer",
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
      rpc: vi.fn().mockResolvedValue({data:[{participant_side:"applicant",recipient_id:"employer-1"}],error:null}),
      from: vi.fn(() => ({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) })),
    } as never);
    await expect(sendApplicationMessage("application-1", "intruder", "Hello")).resolves.toEqual({
      status: "not_allowed",
    });
  });
});

it("paginates newest 50 first and reverses each page for display, including message 51", async () => {
  const rows = Array.from({length: 51}, (_,i) => ({id: `m-${51-i}`,sender_id:"owner",body:`Message ${51-i}`,created_at:"2026-09-09T01:02:03Z"}));
  const range = vi.fn(async (from:number,to:number) => ({data:rows.slice(from,to+1),error:null}));
  const query = {select:()=>query,eq:()=>query,order:vi.fn(()=>query),range};
  mockClient.mockResolvedValue({rpc:vi.fn().mockResolvedValue({data:[{application_id:"a",job_id:"j",job_title:"Job",company_name:"Cafe",application_status:"submitted",participant_side:"applicant",recipient_id:"owner"}],error:null}),from:()=>query} as never);
  const newest = await getApplicationThread("a","applicant");
  expect(newest.status).toBe("ok");
  if(newest.status !== "ok") throw new Error("missing thread");
  expect(newest.thread.hasOlder).toBe(true);
  expect(newest.thread.messages).toHaveLength(50);
  expect(newest.thread.messages[0].id).toBe("m-2");
  expect(newest.thread.messages[49].id).toBe("m-51");
  const older = await getApplicationThread("a","applicant",2);
  if(older.status !== "ok") throw new Error("missing thread");
  expect(older.thread.hasOlder).toBe(false);
  expect(older.thread.messages.map(m=>m.id)).toEqual(["m-1"]);
  expect(range.mock.calls).toEqual([[0,50],[50,100]]);
});

it("admin-only read context cannot authorize sending", async () => {
  const from=vi.fn();
  mockClient.mockResolvedValue({rpc:vi.fn().mockResolvedValue({data:[{participant_side:"admin",recipient_id:null}],error:null}),from} as never);
  expect(await sendApplicationMessage("a","admin","Hello")).toEqual({status:"not_allowed"});
  expect(from).not.toHaveBeenCalled();
});
