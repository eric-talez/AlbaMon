import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createApplication,
  withdrawApplication,
  getEmployerApplications,
  getSeekerApplications,
} from "@/lib/db/applications";

const mockClient = vi.mocked(createSupabaseServerClient);
const insert = vi.fn();
const single = vi.fn();
const rpc = vi.fn();

beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://abcdefghijklmnop.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "sb_publishable_realish_key_value_1234567890",
  );
  insert.mockReset();
  single.mockReset();
  insert.mockReturnValue({ select: vi.fn(() => ({ single })) });
  rpc.mockReset();
  mockClient.mockResolvedValue({
    from: (table: string) => {
      expect(table).toBe("applications");
      return { insert };
    },
    rpc,
    // The helpers exercise only the minimal insert/RPC surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createApplication", () => {
  it("inserts only trusted application fields and omits status", async () => {
    single.mockResolvedValue({ data: { id: "application-1" }, error: null });

    await expect(createApplication("job-1", "user-1", "Hello")).resolves.toEqual({
      status: "created",
      applicationId: "application-1",
    });
    expect(insert).toHaveBeenCalledWith({
      job_id: "job-1",
      seeker_id: "user-1",
      cover_note: "Hello",
    });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("maps duplicate, RLS, FK, and check errors", async () => {
    for (const [code, expected] of [
      ["23505", "duplicate"],
      ["42501", "not_allowed"],
      ["23503", "not_allowed"],
      ["23514", "not_allowed"],
    ] as const) {
      single.mockResolvedValueOnce({ data: null, error: { code } });
      await expect(createApplication("job-1", "user-1", null)).resolves.toEqual({
        status: expected,
      });
    }
  });

  it("returns error for unexpected database failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    single.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(createApplication("job-1", "user-1", null)).resolves.toEqual({
      status: "error",
    });
  });

  it("never writes or mocks success when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(createApplication("job-1", "user-1", null)).resolves.toEqual({
      status: "unavailable",
    });
    expect(mockClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("application listing RPCs", () => {
  it("maps the caller-bound seeker listing without passing an identity", async () => {
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({
      data: [
        {
          application_id: "application-1",
          job_id: "job-1",
          job_title: "Server",
          company_name: "K-Work Cafe",
          job_city: "Los Angeles",
          job_state: "CA",
          application_status: "submitted",
          cover_note: "안녕하세요",
          submitted_at: "2026-06-21T12:00:00.000Z",
          application_updated_at: "2026-09-09T01:02:03.123456Z",
          job_is_public: true,
        },
      ],
      error: null,
    }) });

    await expect(getSeekerApplications()).resolves.toEqual({
      status: "ok", hasNext: false,
      applications: [
        {
          id: "application-1",
          jobId: "job-1",
          jobTitle: "Server",
          companyName: "K-Work Cafe",
          city: "Los Angeles",
          state: "CA",
          status: "submitted",
          coverNote: "안녕하세요",
          submittedAt: "2026-06-21T12:00:00.000Z",
          applicationUpdatedAt: "2026-09-09T01:02:03.123456Z",
          jobIsPublic: true,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("list_seeker_applications");
  });

  it("maps only the limited employer applicant identity fields", async () => {
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({
      data: [
        {
          application_id: "application-2",
          job_id: "job-2",
          job_title: "Cashier",
          company_name: "OC Market",
          applicant_display_name: null,
          applicant_email: "seeker@example.com",
          application_status: "submitted",
          cover_note: null,
          submitted_at: "2026-06-21T11:00:00.000Z",
          application_updated_at: "2026-09-09T01:02:03.123456Z",
          job_is_public: false,
        },
      ],
      error: null,
    }) });

    const result = await getEmployerApplications();
    expect(result).toEqual({
      status: "ok", hasNext: false,
      applications: [
        {
          id: "application-2",
          jobId: "job-2",
          jobTitle: "Cashier",
          companyName: "OC Market",
          applicantDisplayName: null,
          applicantEmail: "seeker@example.com",
          status: "submitted",
          coverNote: null,
          submittedAt: "2026-06-21T11:00:00.000Z",
          applicationUpdatedAt: "2026-09-09T01:02:03.123456Z",
          jobIsPublic: false,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("list_employer_applications");
    expect(JSON.stringify(result)).not.toMatch(/phone|address|metadata/i);
  });

  it("returns explicit errors instead of empty application lists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockReturnValue({ range: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }) });

    await expect(getSeekerApplications()).resolves.toEqual({ status: "error" });
    await expect(getEmployerApplications()).resolves.toEqual({ status: "error" });
  });

  it("returns unavailable and never calls Supabase when unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(getSeekerApplications()).resolves.toEqual({ status: "unavailable" });
    await expect(getEmployerApplications()).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("returns 20 applications per page while keeping raw microseconds", async () => {
  const rows=Array.from({length:21},(_,i)=>({application_id:`a-${i}`,application_updated_at:"2026-09-09T01:02:03.123456+00:00"}));
  const range=vi.fn(async(from:number,to:number)=>({data:rows.slice(from,to+1),error:null}));
  rpc.mockReturnValue({range});
  for(const read of [getSeekerApplications,getEmployerApplications]) {
    const first=await read();
    if(first.status!=="ok") throw new Error("missing list");
    expect(first.applications).toHaveLength(20);
    expect(first.hasNext).toBe(true);
    expect(first.applications[0].applicationUpdatedAt).toBe("2026-09-09T01:02:03.123456+00:00");
    const second=await read(2);
    if(second.status!=="ok") throw new Error("missing list");
    expect(second.applications.map(a=>a.id)).toEqual(["a-20"]);
    expect(second.hasNext).toBe(false);
  }
  expect(range.mock.calls).toEqual([[0,20],[20,40],[0,20],[20,40]]);
});

it("withdrawal RPC forwards the raw timestamp and maps only known responses",async()=>{
  for(const status of ["withdrawn","already_withdrawn","conflict","not_allowed"]) {
    rpc.mockResolvedValueOnce({data:[{status}],error:null});
    expect(await withdrawApplication("a","2026-09-09T01:02:03.123456Z")).toEqual({status});
  }
  expect(rpc).toHaveBeenCalledWith("withdraw_application",{target_application_id:"a",expected_updated_at:"2026-09-09T01:02:03.123456Z"});
  rpc.mockResolvedValueOnce({data:[{status:"unexpected"}],error:null});
  expect(await withdrawApplication("a","2026-09-09T01:02:03.123456Z")).toEqual({status:"error"});
});
