import "server-only";

import {
  JOB_CATEGORIES,
  JOB_TYPES,
  LANGUAGE_REQUIREMENTS,
  PAY_UNITS,
  type Job,
  type JobCategory,
  type JobType,
  type LanguageRequirement,
  type PayUnit,
} from "@/lib/types";
import { getMockJobById, getMockJobs } from "@/lib/mock/jobs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AddressDisplayMode,
  PublicJobCityRow,
  PublicJobListingRow,
} from "@/lib/db/types";

/**
 * Public job reads for K-Work US.
 *
 * Behavior:
 * - Supabase NOT configured in dev/test/build: deterministic approved mocks.
 * - Supabase configured: reads the approved-only public view, including safe
 *   company identity fields for verified and unverified companies.
 * - Production runtime configuration/query failures are surfaced; they never
 *   silently replace real listings with mock data.
 *
 * This is intentionally read-only and approved-only. Employer and admin write
 * paths arrive in later slices.
 */

const PUBLIC_JOB_SELECT =
  "id, title, category, job_type, city, state, address_display, " +
  "address_display_mode, pay_min, pay_max, pay_unit, tips_available, " +
  "schedule_days, schedule_time_range, language_requirement, description, " +
  "responsibilities, requirements, benefits, moderation_status, " +
  "posted_at, company_name, company_is_verified";

/**
 * Mock jobs are a local/test fixture and are never available in production.
 */
function assertMockJobsAllowed(operation: string): void {
  if (!mayFallbackToMockJobs()) {
    throw new Error(
      `[db] ${operation} requires Supabase in production; ` +
        "mock job fallback is disabled.",
    );
  }
}

function mayFallbackToMockJobs(): boolean {
  return process.env.NODE_ENV !== "production";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Map a DB row (snake_case + joined company) to the app's `Job` view type. */
function mapRow(row: PublicJobListingRow): Job {
  return {
    id: row.id,
    title: row.title,
    companyName: row.company_name,
    employerVerified: row.company_is_verified,
    category: row.category,
    jobType: row.job_type,
    city: row.city,
    state: row.state,
    addressDisplay: row.address_display ?? "",
    addressDisplayMode: (row.address_display_mode ?? "city_only") as AddressDisplayMode,
    payMin: Number(row.pay_min),
    payMax: Number(row.pay_max),
    payUnit: row.pay_unit,
    tipsAvailable: row.tips_available,
    scheduleDays: row.schedule_days,
    scheduleTimeRange: row.schedule_time_range,
    languageRequirement: row.language_requirement,
    description: row.description,
    responsibilities: row.responsibilities ?? [],
    requirements: row.requirements ?? [],
    benefits: row.benefits ?? [],
    moderationStatus: row.moderation_status,
    postedAt: row.posted_at ?? "",
  };
}

/** Approved jobs for the public board. */
export async function getApprovedJobs(): Promise<Job[]> {
  if (!isSupabaseConfigured()) {
    assertMockJobsAllowed("getApprovedJobs");
    return getMockJobs();
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("public_job_listings")
      .select(PUBLIC_JOB_SELECT)
      .eq("moderation_status", "approved")
      .order("posted_at", { ascending: false });

    if (error) throw error;
    const rows = (data ?? []) as unknown as PublicJobListingRow[];
    return rows.map(mapRow);
  } catch (err) {
    console.error("[db] getApprovedJobs failed:", err);
    if (!mayFallbackToMockJobs()) throw err;
    console.warn("[db] getApprovedJobs falling back to mock data");
    return getMockJobs();
  }
}

/** A single approved job by id, or `undefined` if not found / not approved. */
export async function getApprovedJobById(id: string): Promise<Job | undefined> {
  const configured = isSupabaseConfigured();
  if (!configured && mayFallbackToMockJobs()) {
    return getMockJobById(id);
  }
  if (!UUID_PATTERN.test(id)) return undefined;
  if (!configured) {
    assertMockJobsAllowed("getApprovedJobById");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("public_job_listings")
      .select(PUBLIC_JOB_SELECT)
      .eq("id", id)
      .eq("moderation_status", "approved")
      .maybeSingle();

    if (error) throw error;
    return data ? mapRow(data as unknown as PublicJobListingRow) : undefined;
  } catch (err) {
    console.error("[db] getApprovedJobById failed:", err);
    if (!mayFallbackToMockJobs()) throw err;
    console.warn("[db] getApprovedJobById falling back to mock data");
    return getMockJobById(id);
  }
}

/* ---------------------------------------------------------------------------
 * Public browse / search
 * -------------------------------------------------------------------------*/

export type JobSort = "newest" | "pay_high" | "pay_low";

const JOB_SORTS: readonly JobSort[] = ["newest", "pay_high", "pay_low"];

/** Validated, app-shaped search parameters for the public board. */
export interface JobSearchParams {
  q?: string;
  city?: string;
  category?: JobCategory;
  jobType?: JobType;
  languageRequirement?: LanguageRequirement;
  payUnit?: PayUnit;
  payMin?: number;
  sort?: JobSort;
  page?: number;
}

export interface JobSearchResult {
  jobs: Job[];
  page: number;
  hasNext: boolean;
}

/** First value for a possibly-repeated query param, trimmed; "" → undefined. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function inEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * Parse raw Next.js `searchParams` into a validated `JobSearchParams`. Invalid
 * enum values, non-numeric / negative `payMin`, and unknown `sort` are silently
 * ignored so the public page can never be broken by a hand-typed query string.
 */
export function parseJobSearchParams(
  raw: Record<string, string | string[] | undefined>,
): JobSearchParams {
  const params: JobSearchParams = { page: 1 };

  const q = firstParam(raw.q);
  if (q) params.q = q.slice(0, 200);

  const city = firstParam(raw.city);
  if (city) params.city = city.slice(0, 100);

  const category = inEnum(firstParam(raw.category), JOB_CATEGORIES);
  if (category) params.category = category;

  const jobType = inEnum(firstParam(raw.jobType), JOB_TYPES);
  if (jobType) params.jobType = jobType;

  const languageRequirement = inEnum(
    firstParam(raw.languageRequirement),
    LANGUAGE_REQUIREMENTS,
  );
  if (languageRequirement) params.languageRequirement = languageRequirement;

  const payUnit = inEnum(firstParam(raw.payUnit), PAY_UNITS);
  if (payUnit) params.payUnit = payUnit;

  const payMinRaw = firstParam(raw.payMin);
  if (payMinRaw !== undefined) {
    const payMin = Number(payMinRaw);
    if (Number.isFinite(payMin) && payMin >= 0) params.payMin = payMin;
  }

  const sort = inEnum(firstParam(raw.sort), JOB_SORTS);
  if (sort) params.sort = sort;

  if (!params.payUnit && (params.payMin !== undefined || sort === "pay_high" || sort === "pay_low")) {
    params.payUnit = "hour";
  }

  const pageRaw = Number(firstParam(raw.page));
  if (Number.isInteger(pageRaw) && pageRaw >= 1 && pageRaw <= 500) {
    params.page = pageRaw;
  }

  return params;
}

function mockPublicJobCities(): string[] {
  return [
    ...new Set(
      getMockJobs().filter((job) => job.state === "CA").map((job) => job.city),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export async function getPublicJobCities(): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    assertMockJobsAllowed("getPublicJobCities");
    return mockPublicJobCities();
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_public_job_cities");
    if (error) throw error;
    return ((data ?? []) as PublicJobCityRow[]).map(({ city }) => city);
  } catch (err) {
    console.error("[db] getPublicJobCities failed:", err);
    if (!mayFallbackToMockJobs()) throw err;
    console.warn("[db] getPublicJobCities falling back to mock data");
    return mockPublicJobCities();
  }
}

/**
 * Filter and sort approved mock jobs in memory. Shared by the Supabase-
 * unconfigured path and the query-error fallback so both behave identically.
 * `getMockJobs()` already returns approved-only.
 */
export function filterAndSortMockJobs(params: JobSearchParams): Job[] {
  const filtered = getMockJobs().filter((job) => {
    if (job.state !== "CA") return false;
    if (params.q && !matchesKeyword(job, params.q)) return false;
    if (params.city && job.city !== params.city) return false;
    if (params.category && job.category !== params.category) return false;
    if (params.jobType && job.jobType !== params.jobType) return false;
    if (
      params.languageRequirement &&
      job.languageRequirement !== params.languageRequirement
    ) {
      return false;
    }
    if (params.payUnit && job.payUnit !== params.payUnit) return false;
    if (params.payMin !== undefined && job.payMin < params.payMin) return false;
    return true;
  });

  return sortJobs(filtered, params.sort);
}

/** Keep keyword semantics identical across mock and Supabase-backed results. */
function matchesKeyword(job: Job, query: string): boolean {
  const keyword = query.toLowerCase();
  return `${job.title} ${job.companyName} ${job.description}`
    .toLowerCase()
    .includes(keyword);
}

function sortJobs(jobs: Job[], sort: JobSort | undefined): Job[] {
  const sorted = [...jobs];
  switch (sort) {
    case "pay_high":
      sorted.sort((a, b) => b.payMin - a.payMin || b.id.localeCompare(a.id));
      break;
    case "pay_low":
      sorted.sort((a, b) => a.payMin - b.payMin || b.id.localeCompare(a.id));
      break;
    case "newest":
    default:
      sorted.sort((a, b) =>
        b.postedAt.localeCompare(a.postedAt) || b.id.localeCompare(a.id),
      );
      break;
  }
  return sorted;
}

function mockSearchResult(
  params: JobSearchParams,
  page: number,
): JobSearchResult {
  const jobs = filterAndSortMockJobs(params);
  const from = (page - 1) * 20;
  return {
    jobs: jobs.slice(from, from + 20),
    page,
    hasNext: jobs.length > from + 20,
  };
}

/**
 * Approved jobs matching `params` for the public board.
 *
 * - Supabase NOT configured: filter/sort the mock data in memory (approved-only).
 * - Supabase configured: query the approved-only `public_job_listings` view and
 *   apply each structured filter. Non-production errors may use the same mock
 *   filter; production runtime errors are rethrown.
 *
 * Pending/draft/rejected jobs are never returned (RLS + the explicit filter).
 */
export async function searchApprovedJobs(
  params: JobSearchParams,
): Promise<JobSearchResult> {
  const requestedPage = params.page;
  const page =
    typeof requestedPage === "number" &&
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 500
      ? requestedPage
      : 1;
  const payUnit = params.payUnit ??
    (params.payMin !== undefined || params.sort === "pay_high" || params.sort === "pay_low"
      ? "hour"
      : undefined);
  const effectiveParams = { ...params, page, payUnit };

  if (!isSupabaseConfigured()) {
    assertMockJobsAllowed("searchApprovedJobs");
    return mockSearchResult(effectiveParams, page);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_public_jobs", {
      search_query: params.q ?? null,
      search_city: params.city ?? null,
      search_category: params.category ?? null,
      search_job_type: params.jobType ?? null,
      search_language_requirement: params.languageRequirement ?? null,
      search_pay_unit: payUnit ?? null,
      search_pay_min: params.payMin ?? null,
      search_sort: params.sort ?? "newest",
      search_page: page,
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as PublicJobListingRow[];
    return {
      jobs: rows.slice(0, 20).map(mapRow),
      page,
      hasNext: rows.length > 20,
    };
  } catch (err) {
    console.error("[db] searchApprovedJobs failed:", err);
    if (!mayFallbackToMockJobs()) throw err;
    console.warn("[db] searchApprovedJobs falling back to mock data");
    return mockSearchResult(effectiveParams, page);
  }
}
