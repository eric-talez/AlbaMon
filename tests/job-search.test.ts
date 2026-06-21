import { afterEach, describe, it, expect, vi } from "vitest";
import {
  parseJobSearchParams,
  searchApprovedJobs,
  filterAndSortMockJobs,
} from "@/lib/db/jobs";

/**
 * Public browse/search over the mock fallback (Supabase unconfigured — the
 * default for dev/test/build). Must stay approved-only and behave identically
 * to the DB path's filter contract.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

function setUnconfigured(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
}

describe("searchApprovedJobs — mock fallback", () => {
  it("returns approved jobs only; never pending/draft", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({});
    expect(jobs.length).toBe(10);
    expect(jobs.every((j) => j.moderationStatus === "approved")).toBe(true);
    const ids = new Set(jobs.map((j) => j.id));
    expect(ids.has("kw-101")).toBe(false); // pending
    expect(ids.has("kw-102")).toBe(false); // draft
  });

  it("keyword search matches title, company, and description (case-insensitive)", async () => {
    setUnconfigured();
    // Company name "강남 키친" → kw-001.
    const byCompany = await searchApprovedJobs({ q: "강남" });
    expect(byCompany.map((j) => j.id)).toEqual(["kw-001"]);
    // Title "카페 바리스타" → kw-006.
    const byTitle = await searchApprovedJobs({ q: "바리스타" });
    expect(byTitle.map((j) => j.id)).toEqual(["kw-006"]);
  });

  it("filters by city", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ city: "Irvine" });
    expect(jobs.map((j) => j.id)).toEqual(["kw-002"]);
  });

  it("filters by category", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ category: "beauty_nail_hair" });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-004", "kw-009"]);
  });

  it("filters by job type", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ jobType: "temporary" });
    expect(jobs.map((j) => j.id)).toEqual(["kw-010"]);
  });

  it("filters by language requirement", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({
      languageRequirement: "english_required",
    });
    expect(jobs.map((j) => j.id)).toEqual(["kw-006"]);
  });

  it("filters by minimum pay (job's pay_max >= payMin)", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ payMin: 28 });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-004", "kw-005", "kw-009"]);
    expect(jobs.every((j) => j.payMax >= 28)).toBe(true);
  });

  it("combines filters (AND semantics)", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({
      category: "restaurant_cafe",
      jobType: "part_time",
    });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-001", "kw-006"]);
  });

  it("sorts newest first by default", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({});
    expect(jobs[0].postedAt).toBe("2026-06-19");
    // Non-increasing postedAt across the list.
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].postedAt >= jobs[i].postedAt).toBe(true);
    }
  });

  it("sorts by highest pay", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ sort: "pay_high" });
    expect(jobs[0].payMax).toBe(35); // kw-005
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].payMax >= jobs[i].payMax).toBe(true);
    }
  });

  it("sorts by lowest pay", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ sort: "pay_low" });
    expect(jobs[0].payMin).toBe(17);
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].payMin <= jobs[i].payMin).toBe(true);
    }
  });

  it("returns empty when no job matches", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({ city: "Nowhere" });
    expect(jobs).toEqual([]);
  });
});

describe("filterAndSortMockJobs — pure helper", () => {
  it("does not mutate the underlying mock array order", () => {
    const high = filterAndSortMockJobs({ sort: "pay_high" });
    const newest = filterAndSortMockJobs({ sort: "newest" });
    // Independent sorts: a fresh call is unaffected by a previous one.
    expect(high[0].payMax).toBe(35);
    expect(newest[0].postedAt).toBe("2026-06-19");
  });
});

describe("parseJobSearchParams — validation", () => {
  it("keeps valid values", () => {
    expect(
      parseJobSearchParams({
        q: "서버",
        city: "Irvine",
        category: "restaurant_cafe",
        jobType: "part_time",
        languageRequirement: "korean_required",
        payMin: "20",
        sort: "pay_high",
      }),
    ).toEqual({
      q: "서버",
      city: "Irvine",
      category: "restaurant_cafe",
      jobType: "part_time",
      languageRequirement: "korean_required",
      payMin: 20,
      sort: "pay_high",
    });
  });

  it("ignores invalid enum values", () => {
    const params = parseJobSearchParams({
      category: "bogus",
      jobType: "permanent",
      languageRequirement: "klingon",
    });
    expect(params.category).toBeUndefined();
    expect(params.jobType).toBeUndefined();
    expect(params.languageRequirement).toBeUndefined();
  });

  it("ignores non-numeric or negative payMin", () => {
    expect(parseJobSearchParams({ payMin: "abc" }).payMin).toBeUndefined();
    expect(parseJobSearchParams({ payMin: "-5" }).payMin).toBeUndefined();
    expect(parseJobSearchParams({ payMin: "0" }).payMin).toBe(0);
  });

  it("drops unknown sort (page treats absent as newest)", () => {
    expect(parseJobSearchParams({ sort: "cheapest" }).sort).toBeUndefined();
    expect(parseJobSearchParams({ sort: "newest" }).sort).toBe("newest");
  });

  it("takes the first value for repeated params", () => {
    expect(parseJobSearchParams({ q: ["first", "second"] }).q).toBe("first");
  });

  it("drops empty / whitespace-only strings", () => {
    expect(parseJobSearchParams({ q: "", city: "   " })).toEqual({});
  });
});
