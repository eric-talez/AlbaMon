import "server-only";

import type { Job } from "@/lib/types";
import { getMockJobById, getMockJobs } from "@/lib/mock/jobs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AddressDisplayMode, JobWithCompanyRow } from "@/lib/db/types";

/**
 * Public job reads for K-Work US.
 *
 * Behavior:
 * - Supabase NOT configured (default in dev/test/build): returns mock data, so
 *   the public shell and the test/build pipeline stay deterministic.
 * - Supabase configured: reads from the DB, joining the company. Only
 *   `approved` jobs are returned — this mirrors the public RLS policy and adds
 *   defense in depth so a misconfiguration can never leak unapproved jobs.
 * - On any query error we log and fall back to mock data; the public path never
 *   throws.
 *
 * This is intentionally read-only and approved-only. Browse/search, employer,
 * and admin queries arrive in later slices.
 */

const JOB_SELECT =
  "id, title, category, job_type, city, state, address_display, " +
  "address_display_mode, pay_min, pay_max, pay_unit, tips_available, " +
  "schedule_days, schedule_time_range, language_requirement, description, " +
  "responsibilities, requirements, benefits, moderation_status, boost, " +
  "posted_at, companies(name, is_verified)";

/** Map a DB row (snake_case + joined company) to the app's `Job` view type. */
function mapRow(row: JobWithCompanyRow): Job {
  return {
    id: row.id,
    title: row.title,
    companyName: row.companies?.name ?? "",
    employerVerified: row.companies?.is_verified ?? false,
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
  if (!isSupabaseConfigured()) return getMockJobs();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("moderation_status", "approved")
      .order("posted_at", { ascending: false });

    if (error) throw error;
    const rows = (data ?? []) as unknown as JobWithCompanyRow[];
    return rows.map(mapRow);
  } catch (err) {
    console.error("[db] getApprovedJobs failed; falling back to mock:", err);
    return getMockJobs();
  }
}

/** A single approved job by id, or `undefined` if not found / not approved. */
export async function getApprovedJobById(id: string): Promise<Job | undefined> {
  if (!isSupabaseConfigured()) return getMockJobById(id);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("id", id)
      .eq("moderation_status", "approved")
      .maybeSingle();

    if (error) throw error;
    return data ? mapRow(data as unknown as JobWithCompanyRow) : undefined;
  } catch (err) {
    console.error("[db] getApprovedJobById failed; falling back to mock:", err);
    return getMockJobById(id);
  }
}
