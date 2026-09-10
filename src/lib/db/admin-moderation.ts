import { normalizePage as adminPage, ADMIN_PAGE_SIZE } from "@/lib/pagination";
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
  updatedAt: string;
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
  | { status: "conflict" | "not_allowed" | "unavailable" | "error" };

type CompanyIdentityRow = Pick<CompanyRow, "id" | "name">;
type OwnerProfileRow = Pick<ProfileRow, "id" | "display_name" | "email">;

const ADMIN_JOB_SELECT =
  "id, company_id, title, category, job_type, city, state, address_display, " +
  "address_display_mode, pay_min, pay_max, pay_unit, tips_available, " +
  "schedule_days, schedule_time_range, language_requirement, description, " +
  "responsibilities, requirements, benefits, moderation_status, created_at, updated_at, expires_at";

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

export async function getAdminJobs(page = 1, status: ModerationStatus | "all" = "pending", jobId?: string): Promise<AdminJobsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("jobs").select(ADMIN_JOB_SELECT);
    if (status !== "all") query = query.eq("moderation_status", status);
    if (jobId) query = query.eq("id", jobId);
    const start = (adminPage(page) - 1) * ADMIN_PAGE_SIZE;
    const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + ADMIN_PAGE_SIZE - 1);
    if (error) throw error;
    const companyIds = [...new Set(((data ?? []) as unknown as JobRow[]).map(job => job.company_id))];
    const companyNames = new Map<string, string>();
    if (companyIds.length) {
      const { data: companies, error: companyError } = await supabase.from("companies").select("id, name").in("id", companyIds);
      if (companyError) throw companyError;
      for (const company of (companies ?? []) as unknown as CompanyIdentityRow[]) companyNames.set(company.id, company.name);
    }

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
        updatedAt: job.updated_at,
      }));
    return { status: "ok", jobs };
  } catch {
    console.error("[db] getAdminJobs failed");
    return { status: "error" };
  }
}

export async function getAdminCompanies(page = 1, verified: boolean | "all" = false): Promise<AdminCompaniesResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("companies").select(ADMIN_COMPANY_SELECT);
    if (verified !== "all") query = query.eq("is_verified", verified);
    const start = (adminPage(page) - 1) * ADMIN_PAGE_SIZE;
    const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + ADMIN_PAGE_SIZE - 1);
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
      });
    return { status: "ok", companies };
  } catch {
    console.error("[db] getAdminCompanies failed");
    return { status: "error" };
  }
}

export async function moderatePendingJob(
  jobId: string,
  decision: "approve" | "reject" | "pause",
  expectedUpdatedAt: string,
  reason: string | null = null,
): Promise<AdminMutationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("transition_job", {
      target_job_id: jobId, command: decision, expected_updated_at: expectedUpdatedAt, reason,
    });
    if (error) throw error;
    const status = data?.[0]?.status;
    return { status: ["updated", "conflict", "not_allowed"].includes(status) ? status : "error" };
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
    const { data, error } = await supabase
      .from("companies")
      .update({ is_verified: isVerified })
      .eq("id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data ? { status: "updated" } : { status: "conflict" };
  } catch {
    console.error("[db] setCompanyVerification failed");
    return { status: "error" };
  }
}

export async function changeAccountStatus(userId: string, command: "suspend_account" | "restore_account", reason: string): Promise<AdminMutationResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const client = await createSupabaseServerClient();
    const { error } = await client.rpc(command, { target_user_id: userId, reason });
    if (error) return { status: error.code === "40001" ? "conflict" : error.code === "42501" ? "not_allowed" : "error" };
    return { status: "updated" };
  } catch { return { status: "error" }; }
}

export type AdminAccount = Pick<ProfileRow, "id" | "display_name" | "email" | "role" | "account_status" | "created_at">;
export async function getAdminAccounts(page = 1, status: "active" | "suspended" = "active"): Promise<{ status: "ok"; accounts: AdminAccount[] } | { status: "error" | "unavailable" }> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const client = await createSupabaseServerClient();
    const start = (adminPage(page) - 1) * ADMIN_PAGE_SIZE;
    const { data, error } = await client.from("profiles").select("id, display_name, email, role, account_status, created_at")
      .eq("account_status", status).order("created_at", { ascending: true }).order("id", { ascending: true }).range(start, start + ADMIN_PAGE_SIZE - 1);
    if (error) return { status: "error" };
    return { status: "ok", accounts: (data ?? []) as AdminAccount[] };
  } catch { return { status: "error" }; }
}

export interface AccountAuditEntry { id: string; actor_id: string | null; entity_id: string; action: string; created_at: string; reason: string | null }
export async function getAccountAudit(userIds: string[]): Promise<AccountAuditEntry[] | null> {
  if (!userIds.length) return [];
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("audit_logs").select("id, actor_id, entity_id, action, created_at, reason:metadata->>reason")
      .eq("entity_type", "profile").in("entity_id", userIds.slice(0,20)).in("action", ["account.suspended", "account.restored"])
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20);
    return error ? null : data as AccountAuditEntry[];
  } catch { return null; }
}
