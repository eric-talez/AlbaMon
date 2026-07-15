import { afterEach, describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import {
  getApprovedJobById,
  getApprovedJobs,
  parseJobSearchParams,
  searchApprovedJobs,
  filterAndSortMockJobs,
} from "@/lib/db/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Public browse/search over the mock fallback (Supabase unconfigured — the
 * default for dev/test/build). Must stay approved-only and behave identically
 * to the DB path's filter contract.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.restoreAllMocks();
});

function setUnconfigured(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
}

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";

function dbJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Warehouse Associate",
    category: "logistics_warehouse",
    job_type: "full_time",
    city: "Buena Park",
    state: "CA",
    address_display: "Buena Park, CA",
    address_display_mode: "city_only",
    pay_min: 20,
    pay_max: 24,
    pay_unit: "hour",
    tips_available: false,
    schedule_days: "Monday-Friday",
    schedule_time_range: "8:00 AM - 5:00 PM",
    language_requirement: "korean_helpful",
    description: "Handle incoming inventory.",
    responsibilities: [],
    requirements: [],
    benefits: [],
    moderation_status: "approved",
    posted_at: "2026-06-19T12:00:00Z",
    company_name: "Pacific Trade Logistics",
    company_is_verified: false,
    ...overrides,
  };
}

describe("searchApprovedJobs — mock fallback", () => {
  it("returns approved jobs only; never pending/draft/expired", async () => {
    setUnconfigured();
    const jobs = await searchApprovedJobs({});
    expect(jobs.length).toBe(10);
    expect(jobs.every((j) => j.moderationStatus === "approved")).toBe(true);
    const ids = new Set(jobs.map((j) => j.id));
    expect(ids.has("kw-101")).toBe(false); // pending
    expect(ids.has("kw-102")).toBe(false); // draft
    expect(ids.has("kw-011")).toBe(false); // approved but expired
    expect(ids.has("kw-012")).toBe(false); // approved but malformed expiry
  });

  it("never returns an expired or malformed-expiry job through any search", async () => {
    setUnconfigured();
    // Broad and targeted searches alike must exclude the hidden fixtures.
    for (const params of [
      {},
      { category: "logistics_warehouse" as const }, // kw-011's category
      { city: "Torrance" }, // kw-012's city
      { q: "마감된" }, // kw-011's title fragment
      { q: "잘못된 만료일" }, // kw-012's title fragment
    ]) {
      const ids = (await searchApprovedJobs(params)).map((j) => j.id);
      expect(ids).not.toContain("kw-011");
      expect(ids).not.toContain("kw-012");
    }
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

describe("searchApprovedJobs — Supabase configured", () => {
  it("matches q against title, joined company name, and description", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);

    const rows = [
      dbJobRow(),
      dbJobRow({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Dental Receptionist",
        description: "Welcome patients and manage appointments.",
        company_name: "Irvine Smile Dental",
        company_is_verified: true,
      }),
      dbJobRow({
        id: "33333333-3333-4333-8333-333333333333",
        title: "Cafe Server",
        description: "Learn specialty coffee preparation.",
        company_name: "Gangnam Kitchen",
        company_is_verified: true,
      }),
    ];
    const fetchMock = vi.fn(async (_input: string | URL | Request) => {
      void _input;
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = createClient(REAL_URL, REAL_KEY, {
      global: { fetch: fetchMock },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const cases = [
      ["warehouse associate", rows[0].id],
      ["irvine smile", rows[1].id],
      ["coffee preparation", rows[2].id],
    ];
    for (const [query, expectedId] of cases) {
      const jobs = await searchApprovedJobs({ q: query });
      expect(jobs.map((job) => job.id)).toEqual([expectedId]);
    }
    const unverifiedCompanyJobs = await searchApprovedJobs({ q: "pacific trade" });
    expect(unverifiedCompanyJobs).toHaveLength(1);
    expect(unverifiedCompanyJobs[0]).toMatchObject({
      companyName: "Pacific Trade Logistics",
      employerVerified: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(cases.length + 1);
    for (const [request] of fetchMock.mock.calls) {
      expect(String(request)).toContain("/rest/v1/public_job_listings?");
      expect(String(request)).toContain("company_name.ilike");
    }
  });
});

describe("public jobs — production fallback safety", () => {
  it("keeps deterministic mocks available during a production build", async () => {
    setUnconfigured();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    expect((await getApprovedJobs()).length).toBeGreaterThan(0);
    expect(await getApprovedJobById("kw-001")).toBeDefined();
    expect((await searchApprovedJobs({ q: "강남" })).map((job) => job.id)).toEqual([
      "kw-001",
    ]);
  });

  it("rejects an unconfigured production runtime instead of showing mocks", async () => {
    setUnconfigured();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    await expect(getApprovedJobs()).rejects.toThrow(/mock job fallback is disabled/i);
    await expect(getApprovedJobById("kw-001")).rejects.toThrow(
      /mock job fallback is disabled/i,
    );
    await expect(searchApprovedJobs({})).rejects.toThrow(
      /mock job fallback is disabled/i,
    );
  });

  it("rethrows configured production DB failures instead of showing mocks", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    const failure = new Error("database unavailable");
    vi.mocked(createSupabaseServerClient).mockRejectedValue(failure);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getApprovedJobs()).rejects.toBe(failure);
    await expect(getApprovedJobById("kw-001")).rejects.toBe(failure);
    await expect(searchApprovedJobs({})).rejects.toBe(failure);
    expect(errorLog).toHaveBeenCalledTimes(3);
    errorLog.mockRestore();
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
