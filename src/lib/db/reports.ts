import { normalizePage as adminPage, ADMIN_PAGE_SIZE } from "@/lib/pagination";
import { writeFailure } from "@/lib/db/write-errors";
import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompanyRow,
  JobRow,
  ProfileRow,
  ReportRow,
} from "@/lib/db/types";
import type { ReportReason, ReportStatus } from "@/lib/types";

export type CreateReportResult =
  | { status: "submitted"; reportId: string }
  | { status: "duplicate" | "not_allowed" | "rate_limited" | "suspended" | "unavailable" | "error" };

export interface AdminReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  jobId: string | null;
  jobTitle: string;
  companyName: string;
  jobModerationStatus: JobRow["moderation_status"] | null;
  jobUpdatedAt: string | null;
  companyIsVerified: boolean;
  reporterDisplayName: string | null;
  reporterEmail: string | null;
  submittedAt: string;
}

export type AdminReportsResult =
  | { status: "ok"; reports: AdminReport[] }
  | { status: "unavailable" | "error" };

export type UpdateReportStatusResult =
  | { status: "updated" }
  | { status: "conflict" | "unavailable" | "error" };

const NOT_ALLOWED_CODES = new Set(["23503", "23514", "42501"]);
const REPORT_SELECT =
  "id, reporter_id, job_id, company_id, reason, details, status, created_at";

type ReportQueueRow = Pick<
  ReportRow,
  "id" | "reporter_id" | "job_id" | "company_id" | "reason" | "details" | "status" | "created_at"
>;
type ReportJobRow = Pick<JobRow, "id" | "company_id" | "title" | "moderation_status" | "updated_at">;
type ReportCompanyRow = Pick<CompanyRow, "id" | "name" | "is_verified">;
type ReporterProfileRow = Pick<ProfileRow, "id" | "display_name" | "email">;

/**
 * Create a job report through the caller's authenticated Supabase session.
 * The helper first verifies the job is visible through the open-only public
 * view, then relies on reports_insert_authenticated RLS as the final gate.
 */
export async function createJobReport(
  jobId: string,
  reporterId: string,
  reason: ReportReason,
  details: string | null,
): Promise<CreateReportResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: approvedJob, error: jobError } = await supabase
      .from("public_job_listings")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!approvedJob) return { status: "not_allowed" };

    const { data, error } = await supabase
      .from("reports")
      .insert({
        reporter_id: reporterId,
        job_id: jobId,
        reason,
        details,
        status: "open",
      })
      .select("id")
      .single();

    if (!error) return { status: "submitted", reportId: data.id as string };
    if (error.code === "23505") return { status: "duplicate" };
    const failure = writeFailure(error);
    if (failure) return { status: failure };
    if (NOT_ALLOWED_CODES.has(error.code)) return { status: "not_allowed" };
    throw error;
  } catch (error) {
    console.error("[db] createJobReport failed:", error);
    return { status: "error" };
  }
}

export async function getAdminReports(page = 1, status: ReportStatus | "all" = "open"): Promise<AdminReportsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("reports").select(REPORT_SELECT);
    if (status !== "all") query = query.eq("status", status);
    const start = (adminPage(page) - 1) * ADMIN_PAGE_SIZE;
    const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + ADMIN_PAGE_SIZE - 1);
    if (error) throw error;

    const reportRows = (data ?? []) as unknown as ReportQueueRow[];
    const jobIds = [
      ...new Set(reportRows.map((report) => report.job_id).filter(Boolean)),
    ] as string[];
    const reporterIds = [
      ...new Set(reportRows.map((report) => report.reporter_id).filter(Boolean)),
    ] as string[];

    const jobs = new Map<string, ReportJobRow>();
    const companies = new Map<string, ReportCompanyRow>();
    const reporters = new Map<string, ReporterProfileRow>();

    if (jobIds.length > 0) {
      const { data: jobRows, error: jobError } = await supabase
        .from("jobs")
        .select("id, company_id, title, moderation_status, updated_at")
        .in("id", jobIds);
      if (jobError) throw jobError;
      for (const job of (jobRows ?? []) as unknown as ReportJobRow[]) {
        jobs.set(job.id, job);
      }

      const companyIds = [
        ...new Set(
          [...jobs.values()].map((job) => job.company_id).filter(Boolean),
        ),
      ] as string[];
      if (companyIds.length > 0) {
        const { data: companyRows, error: companyError } = await supabase
          .from("companies")
          .select("id, name, is_verified")
          .in("id", companyIds);
        if (companyError) throw companyError;
        for (const company of (companyRows ?? []) as unknown as ReportCompanyRow[]) {
          companies.set(company.id, company);
        }
      }
    }

    if (reporterIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", reporterIds);
      if (profileError) throw profileError;
      for (const profile of (profileRows ?? []) as unknown as ReporterProfileRow[]) {
        reporters.set(profile.id, profile);
      }
    }

    return {
      status: "ok",
      reports: reportRows.map((report) => {
        const job = report.job_id ? jobs.get(report.job_id) : undefined;
        const company = job ? companies.get(job.company_id) : undefined;
        const reporter = report.reporter_id
          ? reporters.get(report.reporter_id)
          : undefined;
        return {
          id: report.id,
          reason: report.reason,
          details: report.details,
          status: report.status,
          jobId: report.job_id,
          jobTitle: job?.title ?? "공고 정보 없음",
          companyName: company?.name ?? "회사 정보 없음",
          jobModerationStatus: job?.moderation_status ?? null,
          jobUpdatedAt: job?.updated_at ?? null,
          companyIsVerified: company?.is_verified ?? false,
          reporterDisplayName: reporter?.display_name ?? null,
          reporterEmail: reporter?.email ?? null,
          submittedAt: report.created_at,
        };
      }),
    };
  } catch (error) {
    console.error("[db] getAdminReports failed:", error);
    return { status: "error" };
  }
}

export async function updateReportStatus(
  reportId: string,
  status: Extract<ReportStatus, "reviewed" | "dismissed">,
): Promise<UpdateReportStatusResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("reports")
      .update({ status })
      .eq("id", reportId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data ? { status: "updated" } : { status: "conflict" };
  } catch (error) {
    console.error("[db] updateReportStatus failed:", error);
    return { status: "error" };
  }
}

/** Resolve the relationship on the server; never trust a submitted job ID. */
export async function pauseReportedJob(reportId: string, expectedUpdatedAt: string, reason: string): Promise<UpdateReportStatusResult | { status: "not_allowed" }> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const client = await createSupabaseServerClient();
    const { data: report, error } = await client.from("reports").select("job_id").eq("id", reportId).eq("status", "open").maybeSingle();
    if (error) return { status: "error" };
    if (!report?.job_id) return { status: "conflict" };
    const { data, error: pauseError } = await client.rpc("transition_job", {
      target_job_id: report.job_id, command: "pause", expected_updated_at: expectedUpdatedAt, reason,
    });
    if (pauseError) return { status: "error" };
    if (data?.[0]?.status !== "updated") return { status: data?.[0]?.status === "conflict" ? "conflict" : "not_allowed" };
    // If another reviewer wins now, the pause remains valid and the UI reports
    // a conflict, never claims that a status-only review removed the job.
    return updateReportStatus(reportId, "reviewed");
  } catch { return { status: "error" }; }
}
