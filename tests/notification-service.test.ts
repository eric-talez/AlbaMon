import { afterEach, expect, test, vi } from "vitest";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
test("trusted Auth and DB requests each abort after the five-second budget", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "isolated-double-key");
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const budgets: number[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => { budgets.push(ms); return timeout(20); });
  let aborts = 0;
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { aborts++; reject(init.signal?.reason); });
  }));
  const service = createSupabaseServiceRoleClient();
  const result = await service.rpc("claim_notification_batch", { batch_size: 5 });
  expect(result.error).toBeTruthy();
  // Supabase Auth may throw the native abort instead of returning an Auth error.
  await service.auth.admin.getUserById("c1000000-0000-4000-8000-000000000001").catch(() => null);
  expect(budgets).toEqual([5000, 5000]);
  expect(aborts).toBe(2);
});
