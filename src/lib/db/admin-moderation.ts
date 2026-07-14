import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompanyRow,
  JobRow,
  ModerationStatus,
  ProfileRow,
} from "@/lib/db/types";
import {
  detectComplianceFlags,
  type ComplianceFlag,
} from "@/lib/employer/validation";

export type AdminQueueCountResult =
  | { status: "ok"; count: number }
  | { status: "unavailable" | "error" };

export interface AdminQueueCounts {
  pendingJobs: AdminQueueCountResult;
  unverifiedCompanies: AdminQueueCountResult;
  openReports: AdminQueueCountResult;
}

export interface AdminJob {
  id: string;
  companyName: string;
  title: string;
  category: JobRow["category"];
  jobType: JobRow["job_type"];
  city: string;
  state: string;
  addressDisplay: string | null;
  addressDisplayMode: JobRow["address_display_mode"];
  payMin: number;
  payMax: number;
  payUnit: JobRow["pay_unit"];
  tipsAvailable: boolean;
  scheduleDays: string;
  scheduleTimeRange: string;
  languageRequirement: JobRow["language_requirement"];
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  moderationStatus: ModerationStatus;
  complianceFlags: ComplianceFlag[];
  createdAt: string;
}

export interface AdminCompany {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  city: string;
  state: string;
  addressDisplay: string | null;
  isVerified: boolean;
  ownerDisplayName: string | null;
  ownerEmail: string | null;
  createdAt: string;
}

export type AdminJobsResult =
  | { status: "ok"; jobs: AdminJob[] }
  | { status: "unavailable" | "error" };

export type AdminCompaniesResult =
  | { status: "ok"; companies: AdminCompany[] }
  | { status: "unavailable" | "error" };

export type AdminMutationResult =
  | { status: "updated" }
  | { status: "conflict" | "unavailable" | "error" };

type CompanyIdentityRow = Pick<CompanyRow, "id" | "name">;
type OwnerProfileRow = Pick<ProfileRow, "id" | "display_name" | "email">;

const ADMIN_JOB_SELECT =
  "id, company_id, title, category, job_type, city, state, address_display, " +
  "address_display_mode, pay_min, pay_max, pay_unit, tips_available, " +
  "schedule_days, schedule_time_range, language_requirement, description, " +
  "responsibilities, requirements, benefits, moderation_status, created_at";

const ADMIN_COMPANY_SELECT =
  "id, owner_id, name, description, website, phone, city, state, " +
  "address_display, is_verified, created_at, updated_at";

function toQueueCount(result: {
  count: number | null;
  error: unknown;
}): AdminQueueCountResult {
  if (result.error) {
    console.error("[db] getAdminQueueCounts query failed");
    return { status: "error" };
  }
  return { status: "ok", count: result.count ?? 0 };
}

/**
 * Per-queue moderation counts for the admin dashboard. Each queue resolves
 * independently so a single failing count degrades one card instead of
 * hiding the whole console: unavailable = Supabase not configured, error =
 * that queue's query failed.
 */
export async function getAdminQueueCounts(): Promise<AdminQueueCounts> {
  if (!isSupabaseConfigured()) {
    return {
      pendingJobs: { status: "unavailable" },
      unverifiedCompanies: { status: "unavailable" },
      openReports: { status: "unavailable" },
    };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const [jobs, companies, reports] = await Promise.all([
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("moderation_status", "pending"),
      supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("is_verified", false),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
    ]);
    return {
      pendingJobs: toQueueCount(jobs),
      unverifiedCompanies: toQueueCount(companies),
      openReports: toQueueCount(reports),
    };
  } catch {
    console.error("[db] getAdminQueueCounts failed");
    return {
      pendingJobs: { status: "error" },
      unverifiedCompanies: { status: "error" },
      openReports: { status: "error" },
    };
  }
}

export async function getAdminJobs(): Promise<AdminJobsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, name");
    if (companyError) throw companyError;

    const companyNames = new Map(
      ((companies ?? []) as unknown as CompanyIdentityRow[]).map((company) => [
        company.id,
        company.name,
      ]),
    );
    const { data, error } = await supabase
      .from("jobs")
      .select(ADMIN_JOB_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const jobs = ((data ?? []) as unknown as JobRow[])
      .map((job): AdminJob => ({
        id: job.id,
        companyName: companyNames.get(job.company_id) ?? "회사 정보 없음",
        title: job.title,
        category: job.category,
        jobType: job.job_type,
        city: job.city,
        state: job.state,
        addressDisplay: job.address_display,
        addressDisplayMode: job.address_display_mode,
        payMin: Number(job.pay_min),
        payMax: Number(job.pay_max),
        payUnit: job.pay_unit,
        tipsAvailable: job.tips_available,
        scheduleDays: job.schedule_days,
        scheduleTimeRange: job.schedule_time_range,
        languageRequirement: job.language_requirement,
        description: job.description,
        responsibilities: job.responsibilities ?? [],
        requirements: job.requirements ?? [],
        benefits: job.benefits ?? [],
        moderationStatus: job.moderation_status,
        complianceFlags: detectComplianceFlags([
          job.title,
          job.description,
          ...(job.responsibilities ?? []),
          ...(job.requirements ?? []),
          ...(job.benefits ?? []),
        ].join("\n")),
        createdAt: job.created_at,
      }))
      .sort((a, b) => {
        const pendingDifference =
          Number(b.moderationStatus === "pending") -
          Number(a.moderationStatus === "pending");
        return pendingDifference || b.createdAt.localeCompare(a.createdAt);
      });
    return { status: "ok", jobs };
  } catch {
    console.error("[db] getAdminJobs failed");
    return { status: "error" };
  }
}

export async function getAdminCompanies(): Promise<AdminCompaniesResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("companies")
      .select(ADMIN_COMPANY_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const companyRows = (data ?? []) as unknown as CompanyRow[];
    const ownerIds = [...new Set(companyRows.map((company) => company.owner_id))];
    const owners = new Map<string, OwnerProfileRow>();
    if (ownerIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", ownerIds);
      if (profileError) throw profileError;
      for (const profile of (profiles ?? []) as unknown as OwnerProfileRow[]) {
        owners.set(profile.id, profile);
      }
    }

    const companies = companyRows
      .map((company): AdminCompany => {
        const owner = owners.get(company.owner_id);
        return {
          id: company.id,
          name: company.name,
          description: company.description,
          website: company.website,
          phone: company.phone,
          city: company.city,
          state: company.state,
          addressDisplay: company.address_display,
          isVerified: company.is_verified,
          ownerDisplayName: owner?.display_name ?? null,
          ownerEmail: owner?.email ?? null,
          createdAt: company.created_at,
        };
      })
      .sort((a, b) => {
        const verificationDifference =
          Number(a.isVerified) - Number(b.isVerified);
        return verificationDifference || b.createdAt.localeCompare(a.createdAt);
      });
    return { status: "ok", companies };
  } catch {
    console.error("[db] getAdminCompanies failed");
    return { status: "error" };
  }
}

export async function moderatePendingJob(
  jobId: string,
  decision: "approve" | "reject",
): Promise<AdminMutationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    // Admin-only SQL function: mutates the job and records the audit entry in
    // one transaction. Approval timestamps posted_at inside Postgres.
    const { data, error } = await supabase.rpc("moderate_pending_job", {
      job_id: jobId,
      decision: decision === "approve" ? "approved" : "rejected",
    });
    if (error) {
      // P0001 = the function's own admin/decision exceptions; 42501 = execute
      // privilege missing. requireRole("admin") makes both unreachable in
      // normal flows, so they surface as a generic error.
      if (error.code === "P0001" || error.code === "42501") {
        console.error("[db] moderatePendingJob blocked:", error.code);
        return { status: "error" };
      }
      throw error;
    }
    if (data === "conflict") return { status: "conflict" };
    if (data === "approved" || data === "rejected") {
      return { status: "updated" };
    }
    throw new Error(`Unexpected moderation result: ${String(data)}`);
  } catch {
    console.error("[db] moderatePendingJob failed");
    return { status: "error" };
  }
}

export async function setCompanyVerification(
  companyId: string,
  isVerified: boolean,
): Promise<AdminMutationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    // Admin-only SQL function: flips verification and records the audit entry
    // in one transaction. A company already in the requested state returns
    // conflict and writes nothing.
    const { data, error } = await supabase.rpc("set_company_verification", {
      company_id: companyId,
      verified: isVerified,
    });
    if (error) {
      if (error.code === "P0001" || error.code === "42501") {
        console.error("[db] setCompanyVerification blocked:", error.code);
        return { status: "error" };
      }
      throw error;
    }
    if (data === "conflict") return { status: "conflict" };
    if (data === "verified" || data === "unverified") {
      return { status: "updated" };
    }
    throw new Error(`Unexpected verification result: ${String(data)}`);
  } catch {
    console.error("[db] setCompanyVerification failed");
    return { status: "error" };
  }
}
