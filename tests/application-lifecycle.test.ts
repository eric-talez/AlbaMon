import { expect, it, vi } from "vitest";
import * as actions from "@/lib/applications/status-action";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", async (original) => ({ ...await original<object>(), requireRole: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/db/applications", () => ({ updateApplicationStatus: vi.fn(), withdrawApplication: vi.fn() }));
it("employer UI cannot claim applicant withdrawal", () => {
  expect(actions.EMPLOYER_APPLICATION_STATUSES).toBeDefined();
  expect(actions.EMPLOYER_APPLICATION_STATUSES).not.toContain("withdrawn");
});
it("withdrawal is terminal for employer edits", () => {
  expect(actions.canEmployerChangeStatus?.("withdrawn", "reviewing")).toBe(false);
});

import { afterEach, beforeEach } from "vitest";
import { requireUser } from "@/lib/auth/guards";
import { withdrawApplication } from "@/lib/db/applications";
import { revalidatePath } from "next/cache";
import { normalizePage } from "@/lib/pagination";
beforeEach(() => vi.mocked(requireUser).mockResolvedValue({ id: "applicant", role: "seeker", accountStatus: "active", aal: "aal1", email: "applicant@example.invalid", displayName: null, isDev: false }));
afterEach(()=>vi.clearAllMocks());

function withdrawalForm() {
  const data=new FormData();
  data.set("applicationId","11111111-1111-4111-8111-111111111111");
  data.set("expectedUpdatedAt","2026-09-09T01:02:03.123456+00:00");
  data.set("seeker_id","forged-id");
  return data;
}
it("withdrawal authenticates by session and preserves the exact DB token",async()=>{
  vi.mocked(withdrawApplication).mockResolvedValueOnce({status:"withdrawn"});
  const result=await actions.withdrawApplicationForApplicant(withdrawalForm());
  expect(result.status).toBe("success");
  expect(requireUser).toHaveBeenCalledWith("/dashboard/applications");
  expect(withdrawApplication).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111","2026-09-09T01:02:03.123456+00:00");
  expect(revalidatePath).toHaveBeenCalledWith("/employer/applications");
});
it("withdrawal retries remain successful while stale and unauthorized attempts fail safely",async()=>{
  for(const status of ["already_withdrawn","conflict","not_allowed","unavailable","error"] as const) {
    vi.mocked(withdrawApplication).mockResolvedValueOnce({status});
    const result=await actions.withdrawApplicationForApplicant(withdrawalForm());
    expect(result.status).toBe(status==="already_withdrawn"?"success":"error");
    expect(result.message).not.toMatch(/42501|postgres|policy/i);
    if(status==="conflict") expect(result.message).toContain("refresh");
  }
});
it("withdrawal rejects absent revisions and forged identifiers before writing",async()=>{
  for(const field of ["expectedUpdatedAt","applicationId"]) {
    const form=withdrawalForm();form.set(field,"invalid");
    expect((await actions.withdrawApplicationForApplicant(form)).status).toBe("error");
  }
  expect(withdrawApplication).not.toHaveBeenCalled();
});
it("pagination rejects repeated, fractional and unbounded offsets",()=>{
  for(const value of [undefined,["2","3"],-1,1.5,"NaN",Infinity,1_000_001]) expect(normalizePage(value)).toBe(1);
  expect(normalizePage("2")).toBe(2);
});
