import { policyAcceptanceIdentity } from "@/lib/policy-publication.mjs";
import { POSTING_POLICY_VERSION } from "@/lib/policies";
import { writeFailure } from "@/lib/db/write-errors";
import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobRow, ModerationStatus } from "@/lib/db/types";
import type { EmployerJobInput } from "@/lib/employer/validation";

export interface EmployerJobSummary {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  moderationStatus: ModerationStatus;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EmployerJobListResult =
  | { status: "ok"; jobs: EmployerJobSummary[] }
  | { status: "unavailable" }
  | { status: "error" };

export type EmployerJobWriteResult =
  | { status: "created"; jobId: string }
  | { status: "not_allowed" | "rate_limited" | "suspended" | "unavailable" | "error" };

type CompanyIdentityRow = { id: string; name: string };

export async function getEmployerJobs(ownerId: string): Promise<EmployerJobListResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (companyError) throw companyError;

    const companyRows = (companies ?? []) as unknown as CompanyIdentityRow[];
    if (companyRows.length === 0) return { status: "ok", jobs: [] };
    const names = new Map(companyRows.map((company) => [company.id, company.name]));

    const { data: jobs, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id, title, moderation_status, created_at, updated_at")
      .in("company_id", companyRows.map((company) => company.id))
      .order("created_at", { ascending: false });
    if (jobError) throw jobError;

    const openness = new Map(await Promise.all((jobs ?? []).map(async (job) => {
      const { data, error } = await supabase.rpc("is_job_open", { target_job_id: job.id });
      if (error) throw error;
      return [job.id, data === true] as const;
    })));
    return {
      status: "ok",
      jobs: ((jobs ?? []) as unknown as JobRow[]).map((job) => ({
        id: job.id,
        companyId: job.company_id,
        companyName: names.get(job.company_id) ?? "회사 정보 없음",
        title: job.title,
        moderationStatus: job.moderation_status,
        isOpen: openness.get(job.id) ?? false,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      })),
    };
  } catch {
    console.error("[db] getEmployerJobs failed");
    return { status: "error" };
  }
}

export async function createEmployerJob(
  ownerId: string,
  companyId: string,
  input: EmployerJobInput,
): Promise<EmployerJobWriteResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) return { status: "not_allowed" };

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        company_id: companyId,
        ...toEmployerJobColumns(input),
        moderation_status: "pending",
        // Explicit null: the jobs insert RLS policy requires boost IS NULL for
        // non-admins (paid boosts were de-scoped in Slice 23; column retained).
        boost: null,
      })
      .select("id")
      .single();
    if (error) {
      const failure = writeFailure(error);
      if (failure) return { status: failure };
      if (["23503", "23514", "42501"].includes(error.code)) {
        return { status: "not_allowed" };
      }
      throw error;
    }
    return { status: "created", jobId: data.id as string };
  } catch {
    console.error("[db] createEmployerJob failed");
    return { status: "error" };
  }
}

function toEmployerJobColumns(input: EmployerJobInput) {
  return {
    posting_policy_version: POSTING_POLICY_VERSION,
    posting_policy_identity: policyAcceptanceIdentity(),
    title: input.title,
    category: input.category,
    job_type: input.jobType,
    city: input.city,
    state: input.state,
    address_display: input.addressDisplay,
    address_display_mode: input.addressDisplayMode,
    pay_min: input.payMin,
    pay_max: input.payMax,
    pay_unit: input.payUnit,
    tips_available: input.tipsAvailable,
    schedule_days: input.scheduleDays,
    schedule_time_range: input.scheduleTimeRange,
    language_requirement: input.languageRequirement,
    description: input.description,
    responsibilities: input.responsibilities,
    requirements: input.requirements,
    benefits: input.benefits,
  };
}

export type JobTransitionResult = { status: "updated" | "conflict" | "not_allowed" | "error" };

export async function getOwnedEmployerJob(jobId: string, ownerId: string): Promise<JobRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!job) return null;
  const { data: company, error: companyError } = await supabase.from("companies").select("id")
    .eq("id", job.company_id).eq("owner_id", ownerId).maybeSingle();
  if (companyError) throw companyError;
  return company ? job as JobRow : null;
}

export async function updateEmployerJob(jobId: string, expectedUpdatedAt: string, input: EmployerJobInput): Promise<JobTransitionResult> {
  if (!isSupabaseConfigured()) return { status: "error" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !await getOwnedEmployerJob(jobId, user.id)) return { status: "not_allowed" };
    const { data, error } = await supabase.from("jobs")
      .update({ ...toEmployerJobColumns(input), moderation_status: "pending" })
      .eq("id", jobId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
    if (error) return { status: ["42501", "23514"].includes(error.code) ? "not_allowed" : "error" };
    return { status: data ? "updated" : "conflict" };
  } catch { return { status: "error" }; }
}

export async function transitionEmployerJob(jobId: string, command: "pause" | "close" | "resubmit", expectedUpdatedAt: string): Promise<JobTransitionResult> {
  if (!isSupabaseConfigured()) return { status: "error" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("transition_job", {
      target_job_id: jobId, command, expected_updated_at: expectedUpdatedAt, reason: null,
    });
    if (error) return { status: "error" };
    const status = data?.[0]?.status;
    return { status: ["updated", "conflict", "not_allowed"].includes(status) ? status : "error" };
  } catch { return { status: "error" }; }
}

export async function getJobReviewNote(jobId: string): Promise<{ reason: string; reviewed_at: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_job_review_note", { target_job_id: jobId });
  if (error) throw error;
  return data?.[0] ?? null;
}
