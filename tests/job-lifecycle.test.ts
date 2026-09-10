import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as jobs from "@/lib/db/employer-jobs";
import { getMockJobs } from "@/lib/mock/jobs";
import type { EmployerJobInput } from "@/lib/employer/validation";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("preserves full expiry timestamps in local public fixtures and hides expired ones", () => {
  expect(getMockJobs().every(job => job.expiresAt?.includes("T"))).toBe(true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2101-01-01"));
  expect(getMockJobs()).toEqual([]);
  vi.useRealTimers();
});
it("transition sends the original revision and returns conflict without retrying", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: [{ status: "conflict", job_id: "job-id" }], error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  await expect(jobs.transitionEmployerJob("job-id", "close", "2026-09-09T00:00:00.123456Z")).resolves.toEqual({ status: "conflict" });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("transition_job", {
    target_job_id: "job-id", command: "close", expected_updated_at: "2026-09-09T00:00:00.123456Z", reason: null,
  });
});
it("edit allowlist strips trusted and unrecognized fields and forces pending with exact CAS", async () => {
  const update = vi.fn();
  const chain = { eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
  chain.eq.mockReturnValue(chain); chain.select.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({data:{id:"job-id"},error:null}); update.mockReturnValue(chain);
  const read = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  read.select.mockReturnValue(read); read.eq.mockReturnValue(read);
  read.maybeSingle.mockResolvedValueOnce({data:{id:"job-id",company_id:"company-id"},error:null}).mockResolvedValueOnce({data:{id:"company-id"},error:null});
  vi.mocked(createSupabaseServerClient).mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"owner-id"}},error:null})},from:vi.fn().mockReturnValueOnce(read).mockReturnValueOnce(read).mockReturnValue({update})} as never);
  const input = {title:"Edited", company_id:"attacker", boost:"paid", posted_at:"2100-01-01", created_at:"1900-01-01"} as unknown as EmployerJobInput;
  await expect(jobs.updateEmployerJob("job-id","2026-09-09T00:00:00.123456Z",input)).resolves.toEqual({status:"updated"});
  expect(update.mock.calls[0][0]).toMatchObject({title:"Edited",moderation_status:"pending"});
  for (const field of ["company_id","boost","posted_at","created_at"]) expect(update.mock.calls[0][0]).not.toHaveProperty(field);
  expect(chain.eq).toHaveBeenCalledWith("updated_at","2026-09-09T00:00:00.123456Z");
});
