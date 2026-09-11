import { afterEach, expect, it, vi } from "vitest";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
import { createClient } from "@supabase/supabase-js";
import { getSitemapJobs } from "@/lib/db/sitemap";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function setup(error = false) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-key");
  const rows = Array.from({length:1001}, (_, i) => ({ id:`job-${i}`, updated_at:"2026-09-10T00:00:00Z" }));
  const range = vi.fn(async (from:number,to:number) => ({ data:rows.slice(from,to+1),error:error ? {message:"private upstream detail"} : null }));
  const order = vi.fn(() => ({range}));
  const select = vi.fn(() => ({order}));
  vi.mocked(createClient).mockReturnValue({from:vi.fn(() => ({select}))} as never);
  return {range,order};
}
it("reads all 1001 safe-view rows in stable pages with no cookies or session persistence", async () => {
  const {range,order} = setup();
  const result = await getSitemapJobs();
  expect(result).toHaveLength(1001);
  expect(result[1000]).toEqual({id:"job-1000",updatedAt:"2026-09-10T00:00:00Z"});
  expect(order).toHaveBeenCalledWith("id",{ascending:true});
  expect(range.mock.calls).toEqual([[0,999],[1000,1999]]);
  expect(createClient).toHaveBeenCalledWith("http://127.0.0.1:55321","test-public-key",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
});
it("fails safely without mock rows on database or configuration failure", async () => {
  setup(true);
  await expect(getSitemapJobs()).rejects.toThrow("Sitemap unavailable");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  await expect(getSitemapJobs()).rejects.toThrow("Sitemap unavailable");
});
