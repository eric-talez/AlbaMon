import { acknowledgedPolicies } from "./fixtures/policies";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", async (original) => ({ ...await original<object>(), requireRole: vi.fn() }));
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeFailure, WRITE_RETRY_MESSAGE } from "@/lib/db/write-errors";
import { activeWriterError, requireRole } from "@/lib/auth/guards";
import { suspendAccount, restoreAccount } from "@/app/admin/users/actions";
import type { AuthUser } from "@/lib/auth/types";

const admin = { id: "c2000000-0000-4000-8000-000000000001", role: "admin", aal: "aal2", ...acknowledgedPolicies, accountStatus: "active" } as AuthUser;
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("matches only the exact database quota and suspension errors", () => {
  expect(writeFailure({ code: "P0001", message: "write_rate_limited" })).toBe("rate_limited");
  expect(writeFailure({ code: "P0001", message: "Only an admin may review employer access requests" })).toBeUndefined();
  expect(writeFailure({ code: "42501", message: "write_rate_limited" })).toBeUndefined();
  expect(writeFailure({ code: "42501", message: "account_suspended" })).toBe("suspended");
  expect(WRITE_RETRY_MESSAGE).toContain("잠시 후 다시 시도해 주세요");
});
it("provides a friendly write-only failure without changing read guards", () => {
  expect(activeWriterError(admin)).toBeNull();
  expect(activeWriterError({ ...admin, ...acknowledgedPolicies, accountStatus: "suspended" })).toEqual({ status: "error", message: expect.stringContaining("정지") });
});
it.each([[suspendAccount, "suspend_account"], [restoreAccount, "restore_account"]] as const)("uses a distinct account RPC through the user session", async (action, rpcName) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  vi.mocked(requireRole).mockResolvedValue(admin);
  const rpc = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
  const form = new FormData(); form.set("userId", "c2000000-0000-4000-8000-000000000002"); form.set("reason", "  Reviewed evidence  ");
  expect((await action({ status: "idle", message: "" }, form)).status).toBe("success");
  expect(requireRole).toHaveBeenCalledWith("admin", "/admin/users");
  expect(rpc).toHaveBeenCalledWith(rpcName, { target_user_id: form.get("userId"), reason: "Reviewed evidence" });
  form.set("reason", " ");
  expect((await action({ status: "idle", message: "" }, form)).status).toBe("error");
  expect(rpc).toHaveBeenCalledTimes(1);
});

import { createEmployerJob } from "@/lib/db/employer-jobs";
import { createApplication } from "@/lib/db/applications";
import { sendApplicationMessage } from "@/lib/db/messages";
import { createJobReport, pauseReportedJob } from "@/lib/db/reports";
import { createEmployerAccessRequest } from "@/lib/db/employer-access-requests";
import { getAdminJobs, getAdminCompanies, getAdminAccounts } from "@/lib/db/admin-moderation";
import { getAdminReports } from "@/lib/db/reports";
import { getAdminEmployerAccessRequests } from "@/lib/db/employer-access-requests";

const writes = [
  () => createEmployerJob("actor", "company", {} as never),
  () => createApplication("job", "actor", null),
  () => sendApplicationMessage("application", "actor", "hello"),
  () => createJobReport("job", "actor", "spam", null),
  () => createEmployerAccessRequest("actor", {} as never),
];
it.each(writes)("maps a quota from the actual write helper and rejects unrelated P0001", async (write) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  const single = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "write_rate_limited" } });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), single, maybeSingle: vi.fn().mockResolvedValue({ data: { id: "job" }, error: null }) };
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: vi.fn(() => query), rpc: vi.fn().mockResolvedValue({ data: [{ participant_side: "applicant", recipient_id: "owner" }], error: null }) } as never);
  expect((await write()).status).toBe("rate_limited");
  single.mockResolvedValue({ data: null, error: { code: "P0001", message: "unrelated failure" } });
  expect((await write()).status).toBe("error");
});
it.each([getAdminJobs, getAdminCompanies, getAdminReports, getAdminEmployerAccessRequests, getAdminAccounts])("paginates queue reads in the database with stable oldest-first ordering", async (read) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: vi.fn(() => query) } as never);
  expect((await read(2)).status).toBe("ok");
  expect(query.range).toHaveBeenCalledWith(20,39);
  expect(query.order).toHaveBeenNthCalledWith(1,"created_at",{ascending:true});
  expect(query.order).toHaveBeenNthCalledWith(2,"id",{ascending:true});
  expect(query.eq).toHaveBeenCalledTimes(1);
});
it("resolves the report's job, pauses with B2 CAS/reason, then marks reviewed", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { job_id: "related-job" }, error: null }) };
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: [{status:"updated"}], error: null })
    .mockResolvedValueOnce({ data: "reviewed", error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: vi.fn(() => query), rpc } as never);
  expect((await pauseReportedJob("report", "raw-revision", "Evidence reason")).status).toBe("updated");
  expect(rpc).toHaveBeenCalledWith("transition_job", {target_job_id:"related-job",command:"pause",expected_updated_at:"raw-revision",reason:"Evidence reason"});
  expect(rpc).toHaveBeenNthCalledWith(2, "review_report", {report_id:"report",decision:"reviewed"});
  expect(query.update).not.toHaveBeenCalled();
  rpc.mockClear(); rpc.mockResolvedValue({data:[{status:"conflict"}],error:null});
  expect((await pauseReportedJob("report","stale","Reason")).status).toBe("conflict");
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("opens a report's exact job in the private admin queue even after publication ends", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({data:[],error:null}) };
  vi.mocked(createSupabaseServerClient).mockResolvedValue({from:vi.fn(()=>query)} as never);
  await getAdminJobs(1,"all","c2000000-0000-4000-8000-000000000005");
  expect(query.eq).toHaveBeenCalledWith("id","c2000000-0000-4000-8000-000000000005");
});
