import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePage } from "@/lib/pagination";
import { canEmployerChangeStatus } from "@/lib/applications/status";
import type { ApplicationStatus } from "@/lib/types";
import type {
  EmployerApplicationListingRow,
  SeekerApplicationListingRow,
} from "@/lib/db/types";

export type CreateApplicationResult =
  | { status: "created"; applicationId: string }
  | { status: "duplicate" | "not_allowed" | "unavailable" | "error" };

export type UpdateApplicationStatusResult =
  | {
      status: "updated";
      previousStatus: string;
      nextStatus: ApplicationStatus;
    }
  | { status: "not_allowed" | "not_found" | "conflict" | "unavailable" | "error" };

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
  applicationUpdatedAt: string;
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
  applicationUpdatedAt: string;
}

export type ApplicationListResult<T> =
  | { status: "ok"; applications: T[]; hasNext: boolean }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Create one seeker application through the caller's authenticated Supabase
 * session. The database trigger locks the job, binds seeker identity, and checks is_job_open; RLS remains an authorization gate; this helper never uses a
 * service-role client and never substitutes a mock write.
 */
export async function createApplication(
  jobId: string,
  seekerId: string,
  coverNote: string | null,
): Promise<CreateApplicationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("applications")
      .insert({
        job_id: jobId,
        seeker_id: seekerId,
        cover_note: coverNote,
      })
      .select("id")
      .single();

    if (!error) return { status: "created", applicationId: data.id as string };
    if (error.code === "23505") return { status: "duplicate" };
    if (NOT_ALLOWED_CODES.has(error.code)) return { status: "not_allowed" };

    console.error("[db] createApplication failed:", error);
    return { status: "error" };
  } catch (error) {
    console.error("[db] createApplication failed:", error);
    return { status: "error" };
  }
}

/** Read the authenticated seeker's own application history through the RPC. */
export async function getSeekerApplications(page = 1): Promise<
  ApplicationListResult<SeekerApplicationSummary>
> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_seeker_applications")
      .range((normalizePage(page) - 1) * 20, (normalizePage(page) - 1) * 20 + 20);
    if (error) throw error;

    const rows = (data ?? []) as unknown as SeekerApplicationListingRow[];
    return {
      status: "ok",
      hasNext: rows.length > 20,
      applications: rows.slice(0, 20).map((row) => ({
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
        applicationUpdatedAt: row.application_updated_at,
      })),
    };
  } catch (error) {
    console.error("[db] getSeekerApplications failed:", error);
    return { status: "error" };
  }
}

/** Read applications for jobs owned by the authenticated employer. */
export async function getEmployerApplications(page = 1): Promise<
  ApplicationListResult<EmployerApplicationSummary>
> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_employer_applications")
      .range((normalizePage(page) - 1) * 20, (normalizePage(page) - 1) * 20 + 20);
    if (error) throw error;

    const rows = (data ?? []) as unknown as EmployerApplicationListingRow[];
    return {
      status: "ok",
      hasNext: rows.length > 20,
      applications: rows.slice(0, 20).map((row) => ({
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
        applicationUpdatedAt: row.application_updated_at,
      })),
    };
  } catch (error) {
    console.error("[db] getEmployerApplications failed:", error);
    return { status: "error" };
  }
}

/** Read the prior status, then conditionally update using the form's raw DB revision.
 * RLS and the DB trigger enforce ownership and applicant withdrawal terminality. */
export async function updateApplicationStatus(
  applicationId: string,
  nextStatus: ApplicationStatus,
  expectedUpdatedAt: string,
): Promise<UpdateApplicationStatusResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: readError } = await supabase
      .from("applications")
      .select("status")
      .eq("id", applicationId)
      .maybeSingle();
    if (readError) {
      if (NOT_ALLOWED_CODES.has(readError.code)) return { status: "not_allowed" };
      throw readError;
    }
    if (!existing) return { status: "not_found" };
    const previousStatus = existing.status as ApplicationStatus;
    if (!canEmployerChangeStatus(previousStatus, nextStatus)) return { status: "not_allowed" };

    const { data, error } = await supabase
      .from("applications")
      .update({ status: nextStatus })
      .eq("id", applicationId)
      .eq("updated_at", expectedUpdatedAt)
      .select("id")
      .maybeSingle();
    if (error) {
      if (NOT_ALLOWED_CODES.has(error.code)) return { status: "not_allowed" };
      throw error;
    }
    // The visible row changed since this form was rendered (or access was revoked).
    if (!data) return { status: "conflict" };

    return { status: "updated", previousStatus, nextStatus };
  } catch (error) {
    console.error("[db] updateApplicationStatus failed:", error);
    return { status: "error" };
  }
}

export type WithdrawApplicationResult = {
  status: "withdrawn" | "already_withdrawn" | "conflict" | "not_allowed" | "unavailable" | "error";
};

export async function withdrawApplication(applicationId: string, expectedUpdatedAt: string): Promise<WithdrawApplicationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("withdraw_application", {
      target_application_id: applicationId, expected_updated_at: expectedUpdatedAt,
    });
    if (error) throw error;
    const status = data?.[0]?.status;
    if (["withdrawn", "already_withdrawn", "conflict", "not_allowed"].includes(status)) return { status };
  } catch {
    console.error("[db] withdrawApplication failed");
  }
  return { status: "error" };
}
