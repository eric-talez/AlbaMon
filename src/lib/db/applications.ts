import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EmployerApplicationListingRow,
  SeekerApplicationListingRow,
} from "@/lib/db/types";

export type CreateApplicationResult =
  | "created"
  | "duplicate"
  | "not_allowed"
  | "unavailable"
  | "error";

const NOT_ALLOWED_CODES = new Set(["23503", "23514", "42501"]);

export interface SeekerApplicationSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  city: string;
  state: string;
  status: string;
  coverNote: string | null;
  submittedAt: string;
  jobIsPublic: boolean;
}

export interface EmployerApplicationSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  applicantDisplayName: string | null;
  applicantEmail: string | null;
  status: string;
  coverNote: string | null;
  submittedAt: string;
  jobIsPublic: boolean;
}

export type ApplicationListResult<T> =
  | { status: "ok"; applications: T[] }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Create one seeker application through the caller's authenticated Supabase
 * session. RLS remains the final authorization gate; this helper never uses a
 * service-role client and never substitutes a mock write.
 */
export async function createApplication(
  jobId: string,
  seekerId: string,
  coverNote: string | null,
): Promise<CreateApplicationResult> {
  if (!isSupabaseConfigured()) return "unavailable";

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("applications").insert({
      job_id: jobId,
      seeker_id: seekerId,
      cover_note: coverNote,
    });

    if (!error) return "created";
    if (error.code === "23505") return "duplicate";
    if (NOT_ALLOWED_CODES.has(error.code)) return "not_allowed";

    console.error("[db] createApplication failed:", error);
    return "error";
  } catch (error) {
    console.error("[db] createApplication failed:", error);
    return "error";
  }
}

/** Read the authenticated seeker's own application history through the RPC. */
export async function getSeekerApplications(): Promise<
  ApplicationListResult<SeekerApplicationSummary>
> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_seeker_applications");
    if (error) throw error;

    const rows = (data ?? []) as unknown as SeekerApplicationListingRow[];
    return {
      status: "ok",
      applications: rows.map((row) => ({
        id: row.application_id,
        jobId: row.job_id,
        jobTitle: row.job_title,
        companyName: row.company_name,
        city: row.job_city,
        state: row.job_state,
        status: row.application_status,
        coverNote: row.cover_note,
        submittedAt: row.submitted_at,
        jobIsPublic: row.job_is_public,
      })),
    };
  } catch (error) {
    console.error("[db] getSeekerApplications failed:", error);
    return { status: "error" };
  }
}

/** Read applications for jobs owned by the authenticated employer. */
export async function getEmployerApplications(): Promise<
  ApplicationListResult<EmployerApplicationSummary>
> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_employer_applications");
    if (error) throw error;

    const rows = (data ?? []) as unknown as EmployerApplicationListingRow[];
    return {
      status: "ok",
      applications: rows.map((row) => ({
        id: row.application_id,
        jobId: row.job_id,
        jobTitle: row.job_title,
        companyName: row.company_name,
        applicantDisplayName: row.applicant_display_name,
        applicantEmail: row.applicant_email,
        status: row.application_status,
        coverNote: row.cover_note,
        submittedAt: row.submitted_at,
        jobIsPublic: row.job_is_public,
      })),
    };
  } catch (error) {
    console.error("[db] getEmployerApplications failed:", error);
    return { status: "error" };
  }
}
