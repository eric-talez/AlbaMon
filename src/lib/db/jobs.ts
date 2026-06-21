import "server-only";

import { PHASE_PRODUCTION_BUILD } from "next/constants";
import {
  JOB_CATEGORIES,
  JOB_TYPES,
  LANGUAGE_REQUIREMENTS,
  type Job,
  type JobCategory,
  type JobType,
  type LanguageRequirement,
} from "@/lib/types";
import { getMockJobById, getMockJobs } from "@/lib/mock/jobs";
import { isProduction, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AddressDisplayMode, PublicJobListingRow } from "@/lib/db/types";

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
  "responsibilities, requirements, benefits, moderation_status, boost, " +
  "posted_at, company_name, company_is_verified";

/**
 * Mock jobs are a local/test/build fixture, never a production-runtime outage
 * fallback. Next sets NEXT_PHASE during `next build`, where deterministic mock
 * data is still required to prerender the mock job detail paths.
 */
function assertMockJobsAllowed(operation: string): void {
  const isBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
  if (isProduction() && !isBuild) {
    throw new Error(
      `[db] ${operation} requires Supabase in production runtime; ` +
        "mock job fallback is disabled.",
    );
  }
}

function mayFallbackToMockJobs(): boolean {
  return (
    !isProduction() || process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
  );
}

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
    boost: row.boost,
    // Job.postedAt is an ISO date (YYYY-MM-DD); posted_at is a timestamptz.
    postedAt: row.posted_at ? row.posted_at.slice(0, 10) : "",
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
  if (!isSupabaseConfigured()) {
    assertMockJobsAllowed("getApprovedJobById");
    return getMockJobById(id);
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
  payMin?: number;
  sort?: JobSort;
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
  const params: JobSearchParams = {};

  const q = firstParam(raw.q);
  if (q) params.q = q;

  const city = firstParam(raw.city);
  if (city) params.city = city;

  const category = inEnum(firstParam(raw.category), JOB_CATEGORIES);
  if (category) params.category = category;

  const jobType = inEnum(firstParam(raw.jobType), JOB_TYPES);
  if (jobType) params.jobType = jobType;

  const languageRequirement = inEnum(
    firstParam(raw.languageRequirement),
    LANGUAGE_REQUIREMENTS,
  );
  if (languageRequirement) params.languageRequirement = languageRequirement;

  const payMinRaw = firstParam(raw.payMin);
  if (payMinRaw !== undefined) {
    const payMin = Number(payMinRaw);
    if (Number.isFinite(payMin) && payMin >= 0) params.payMin = payMin;
  }

  const sort = inEnum(firstParam(raw.sort), JOB_SORTS);
  if (sort) params.sort = sort;

  return params;
}

/**
 * Filter and sort approved mock jobs in memory. Shared by the Supabase-
 * unconfigured path and the query-error fallback so both behave identically.
 * `getMockJobs()` already returns approved-only.
 */
export function filterAndSortMockJobs(params: JobSearchParams): Job[] {
  const filtered = getMockJobs().filter((job) => {
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
    // "Minimum pay" filter: keep jobs whose top of range meets the floor.
    if (params.payMin !== undefined && job.payMax < params.payMin) return false;
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
      sorted.sort((a, b) => b.payMax - a.payMax);
      break;
    case "pay_low":
      sorted.sort((a, b) => a.payMin - b.payMin);
      break;
    case "newest":
    default:
      sorted.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
      break;
  }
  return sorted;
}

/** Escape PostgREST `or`/`ilike` metacharacters in a user-supplied term. */
function escapeIlike(term: string): string {
  return term.replace(/[%,()_\\]/g, "\\$&");
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
): Promise<Job[]> {
  if (!isSupabaseConfigured()) {
    assertMockJobsAllowed("searchApprovedJobs");
    return filterAndSortMockJobs(params);
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("public_job_listings")
      .select(PUBLIC_JOB_SELECT)
      .eq("moderation_status", "approved");

    if (params.city) query = query.eq("city", params.city);
    if (params.category) query = query.eq("category", params.category);
    if (params.jobType) query = query.eq("job_type", params.jobType);
    if (params.languageRequirement) {
      query = query.eq("language_requirement", params.languageRequirement);
    }
    if (params.payMin !== undefined) {
      query = query.gte("pay_max", params.payMin);
    }
    if (params.q) {
      const term = escapeIlike(params.q);
      query = query.or(
        `title.ilike.%${term}%,company_name.ilike.%${term}%,` +
          `description.ilike.%${term}%`,
      );
    }
    switch (params.sort) {
      case "pay_high":
        query = query.order("pay_max", { ascending: false });
        break;
      case "pay_low":
        query = query.order("pay_min", { ascending: true });
        break;
      case "newest":
      default:
        query = query.order("posted_at", { ascending: false });
        break;
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as PublicJobListingRow[];
    const jobs = rows.map(mapRow);

    // The public view flattens safe company identity into `company_name`, so the
    // DB can search all three fields in one OR. Re-check the mapped rows to keep
    // exact case-insensitive substring semantics aligned with the mock path.
    const keyword = params.q;
    return keyword
      ? jobs.filter((job) => matchesKeyword(job, keyword))
      : jobs;
  } catch (err) {
    console.error("[db] searchApprovedJobs failed:", err);
    if (!mayFallbackToMockJobs()) throw err;
    console.warn("[db] searchApprovedJobs falling back to mock data");
    return filterAndSortMockJobs(params);
  }
}
