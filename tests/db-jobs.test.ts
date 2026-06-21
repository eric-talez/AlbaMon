import { afterEach, describe, it, expect, vi } from "vitest";
import { getApprovedJobs, getApprovedJobById } from "@/lib/db/jobs";

/**
 * With Supabase unconfigured (the default for dev/test/build), the DB access
 * layer must transparently fall back to mock data and expose ONLY approved
 * jobs — parity with the mock-layer guarantees in tests/jobs.test.ts.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function setUnconfigured(): void {
  // Placeholder/empty values mean "Supabase not configured".
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
}

describe("getApprovedJobs (mock fallback)", () => {
  it("returns only approved jobs when Supabase is not configured", async () => {
    setUnconfigured();
    const jobs = await getApprovedJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.moderationStatus === "approved")).toBe(true);
  });
});

describe("getApprovedJobById (mock fallback)", () => {
  it("never returns a non-approved job", async () => {
    setUnconfigured();
    expect(await getApprovedJobById("kw-101")).toBeUndefined(); // pending
    expect(await getApprovedJobById("kw-102")).toBeUndefined(); // draft
    expect((await getApprovedJobById("kw-001"))?.moderationStatus).toBe(
      "approved",
    );
  });
});
