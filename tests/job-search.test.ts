import { afterEach, describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import {
  filterAndSortMockJobs,
  getApprovedJobById,
  getApprovedJobs,
  getPublicJobCities,
  parseJobSearchParams,
  searchApprovedJobs,
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
  it("returns approved jobs only; never pending/draft", async () => {
    setUnconfigured();
    const { jobs, page, hasNext } = await searchApprovedJobs({});
    expect(jobs.length).toBe(13);
    expect(page).toBe(1);
    expect(hasNext).toBe(false);
    expect(jobs.every((j) => j.moderationStatus === "approved")).toBe(true);
    const ids = new Set(jobs.map((j) => j.id));
    expect(ids.has("kw-101")).toBe(false); // pending
    expect(ids.has("kw-102")).toBe(false); // draft
  });

  it("keyword search matches title, company, and description (case-insensitive)", async () => {
    setUnconfigured();
    // Company name "강남 키친" → kw-001.
    const { jobs: byCompany } = await searchApprovedJobs({ q: "강남" });
    expect(byCompany.map((j) => j.id)).toEqual(["kw-001"]);
    // Title "카페 바리스타" → kw-006.
    const { jobs: byTitle } = await searchApprovedJobs({ q: "바리스타" });
    expect(byTitle.map((j) => j.id)).toEqual(["kw-006"]);
  });

  it("treats punctuation in a keyword as literal text", async () => {
    setUnconfigured();
    for (const query of ["*", ",", "open(", "close)", "%", "_"]) {
      const { jobs } = await searchApprovedJobs({ q: query });
      expect(jobs.map((job) => job.id)).toEqual(["kw-011"]);
    }
  });

  it("filters by city", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ city: "Irvine" });
    expect(jobs.map((j) => j.id)).toEqual(["kw-002"]);
  });

  it("filters by category", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ category: "beauty_nail_hair" });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-004", "kw-009"]);
  });

  it("filters by job type", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ jobType: "temporary" });
    expect(jobs.map((j) => j.id)).toEqual(["kw-010"]);
  });

  it("filters by language requirement", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({
      languageRequirement: "english_required",
    });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-006", "kw-013"]);
  });

  it("compares the exact minimum only among jobs with the same pay unit", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({
      q: "급여 의미 테스트",
      payMin: 20,
      payUnit: "hour",
    });
    expect(jobs.map((j) => j.id)).toEqual(["kw-012"]);
    expect(jobs[0]).toMatchObject({ payMin: 22, payMax: 25, payUnit: "hour" });
  });

  it("combines filters (AND semantics)", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({
      category: "restaurant_cafe",
      jobType: "part_time",
    });
    expect(jobs.map((j) => j.id).sort()).toEqual(["kw-001", "kw-006"]);
  });

  it("sorts newest first by default", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({});
    expect(jobs.slice(0, 3).map((job) => job.id)).toEqual([
      "kw-013",
      "kw-012",
      "kw-011",
    ]);
    // Non-increasing postedAt across the list.
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].postedAt >= jobs[i].postedAt).toBe(true);
    }
  });

  it("sorts by highest pay", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ sort: "pay_high" });
    expect(jobs[0].payMin).toBe(25); // kw-005
    expect(jobs.every((job) => job.payUnit === "hour")).toBe(true);
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].payMin >= jobs[i].payMin).toBe(true);
    }
  });

  it("sorts by lowest pay", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ sort: "pay_low" });
    expect(jobs[0].payMin).toBe(17);
    for (let i = 1; i < jobs.length; i++) {
      expect(jobs[i - 1].payMin <= jobs[i].payMin).toBe(true);
    }
  });

  it("returns empty when no job matches", async () => {
    setUnconfigured();
    const { jobs } = await searchApprovedJobs({ city: "Nowhere" });
    expect(jobs).toEqual([]);
  });
});

describe("searchApprovedJobs — Supabase configured", () => {
  it("passes literal keywords to the search RPC without PostgREST filter grammar", async () => {
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
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const query = JSON.parse(String(init?.body)).search_query;
      const matchingRows = new Map([
        ["warehouse associate", [rows[0]]],
        ["irvine smile", [rows[1]]],
        ["coffee preparation", [rows[2]]],
        ["pacific trade", [rows[0]]],
        ["*", []],
        [",", []],
        ["(", []],
        [")", []],
      ]).get(query) ?? [];
      expect(String(input)).toContain("/rest/v1/rpc/search_public_jobs");
      return new Response(JSON.stringify(matchingRows), {
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
      const { jobs } = await searchApprovedJobs({ q: query });
      expect(jobs.map((job) => job.id)).toEqual([expectedId]);
    }
    const { jobs: unverifiedCompanyJobs } = await searchApprovedJobs({ q: "pacific trade" });
    expect(unverifiedCompanyJobs).toHaveLength(1);
    expect(unverifiedCompanyJobs[0]).toMatchObject({
      companyName: "Pacific Trade Logistics",
      employerVerified: false,
    });

    for (const query of ["*", ",", "(", ")"]) {
      await expect(searchApprovedJobs({ q: query })).resolves.toMatchObject({ jobs: [] });
    }
    expect(fetchMock).toHaveBeenCalledTimes(cases.length + 5);
  });

  it("keeps the twenty-first database row only as the next-page signal", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);
    const rows = Array.from({ length: 21 }, (_, index) =>
      dbJobRow({
        id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
        posted_at: `2026-06-20T${String(23 - index).padStart(2, "0")}:00:00Z`,
      }),
    );
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createClient(REAL_URL, REAL_KEY, { global: { fetch: fetchMock } }),
    );

    const result = await searchApprovedJobs({ page: 2, sort: "newest" });
    expect(result).toMatchObject({ page: 2, hasNext: true });
    expect(result.jobs).toHaveLength(20);
    expect(result.jobs[0].postedAt).toBe("2026-06-20T23:00:00Z");
  });
});

describe("public jobs — production fallback safety", () => {
  it("rejects mock fallbacks during a production build", async () => {
    setUnconfigured();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await expect(getApprovedJobs()).rejects.toThrow(/mock job fallback is disabled/i);
    await expect(
      getApprovedJobById("11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow(/mock job fallback is disabled/i);
    await expect(searchApprovedJobs({ q: "강남" })).rejects.toThrow(
      /mock job fallback is disabled/i,
    );
  });

  it("rejects an unconfigured production runtime instead of showing mocks", async () => {
    setUnconfigured();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");

    await expect(getApprovedJobs()).rejects.toThrow(/mock job fallback is disabled/i);
    await expect(
      getApprovedJobById("11111111-1111-4111-8111-111111111111"),
    ).rejects.toThrow(
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
    await expect(
      getApprovedJobById("11111111-1111-4111-8111-111111111111"),
    ).rejects.toBe(failure);
    await expect(searchApprovedJobs({})).rejects.toBe(failure);
    expect(errorLog).toHaveBeenCalledTimes(3);
    errorLog.mockRestore();
  });

  it("does not send malformed ids to Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);

    expect(await getApprovedJobById("not-a-uuid")).toBeUndefined();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe("filterAndSortMockJobs — pure helper", () => {
  it("does not mutate the underlying mock array order", () => {
    const high = filterAndSortMockJobs({ sort: "pay_high", payUnit: "hour" });
    const newest = filterAndSortMockJobs({ sort: "newest" });
    // Independent sorts: a fresh call is unaffected by a previous one.
    expect(high[0].payMin).toBe(25);
    expect(newest[0].postedAt).toBe("2026-06-20T10:00:00Z");
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
        payUnit: "year",
        payMin: "20",
        sort: "pay_high",
        page: "2",
      }),
    ).toEqual({
      q: "서버",
      city: "Irvine",
      category: "restaurant_cafe",
      jobType: "part_time",
      languageRequirement: "korean_required",
      payUnit: "year",
      payMin: 20,
      sort: "pay_high",
      page: 2,
    });
  });

  it("treats a pay filter or sort without a unit as hourly", () => {
    expect(parseJobSearchParams({ payMin: "20", sort: "pay_high" })).toMatchObject({
      payMin: 20,
      payUnit: "hour",
      sort: "pay_high",
    });
    expect(parseJobSearchParams({ sort: "pay_low" }).payUnit).toBe("hour");
  });

  it("bounds text and page inputs", () => {
    expect(parseJobSearchParams({ page: "-1" }).page).toBe(1);
    expect(parseJobSearchParams({ page: "501" }).page).toBe(1);
    expect(parseJobSearchParams({ page: "3.5" }).page).toBe(1);
    expect(parseJobSearchParams({ q: "q".repeat(201) }).q).toHaveLength(200);
    expect(parseJobSearchParams({ city: "c".repeat(101) }).city).toHaveLength(100);
  });

  it("ignores invalid enum values", () => {
    const params = parseJobSearchParams({
      category: "bogus",
      jobType: "permanent",
      languageRequirement: "klingon",
      payUnit: "minute",
    });
    expect(params.category).toBeUndefined();
    expect(params.jobType).toBeUndefined();
    expect(params.languageRequirement).toBeUndefined();
    expect(params.payUnit).toBeUndefined();
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
    expect(parseJobSearchParams({ q: "", city: "   " })).toEqual({ page: 1 });
  });
});

describe("getPublicJobCities — mock fallback", () => {
  it("returns distinct normalized California cities in display order", async () => {
    setUnconfigured();
    const cities = await getPublicJobCities();
    expect(cities).toContain("Los Angeles");
    expect(cities).toContain("San Jose");
    expect(cities).toEqual([...new Set(cities)].sort((a, b) => a.localeCompare(b)));
  });
});
