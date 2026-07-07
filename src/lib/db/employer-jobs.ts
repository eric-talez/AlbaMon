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
  createdAt: string;
}

export type EmployerJobListResult =
  | { status: "ok"; jobs: EmployerJobSummary[] }
  | { status: "unavailable" }
  | { status: "error" };

export type EmployerJobWriteResult =
  | { status: "created"; jobId: string }
  | { status: "not_allowed" | "unavailable" | "error" };

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
      .select("id, company_id, title, moderation_status, created_at")
      .in("company_id", companyRows.map((company) => company.id))
      .order("created_at", { ascending: false });
    if (jobError) throw jobError;

    return {
      status: "ok",
      jobs: ((jobs ?? []) as unknown as JobRow[]).map((job) => ({
        id: job.id,
        companyId: job.company_id,
        companyName: names.get(job.company_id) ?? "회사 정보 없음",
        title: job.title,
        moderationStatus: job.moderation_status,
        createdAt: job.created_at,
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
        moderation_status: "pending",
        // Explicit null: the jobs insert RLS policy requires boost IS NULL for
        // non-admins (paid boosts were de-scoped in Slice 23; column retained).
        boost: null,
      })
      .select("id")
      .single();
    if (error) {
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
