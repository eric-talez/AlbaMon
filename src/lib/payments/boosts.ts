import "server-only";

import type { BoostType, ModerationStatus } from "@/lib/types";
import { BOOST_TYPES } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceRoleClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service";
import {
  getSiteUrl,
  getStripePriceId,
  getStripeSecretKey,
  isStripeCheckoutConfigured,
} from "@/lib/payments/config";

export type BoostCheckoutResult =
  | { status: "created"; url: string }
  | { status: "invalid_type" | "not_allowed" | "unavailable" | "error" };

export type BoostActivationResult =
  | { status: "activated" }
  | { status: "invalid" | "unavailable" | "not_found" | "error" };

export interface OwnedBoostJob {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  boost: BoostType | null;
  moderationStatus: ModerationStatus;
}

type JobOwnershipRow = {
  id: string;
  company_id: string;
  title: string;
  boost: BoostType | null;
  moderation_status: ModerationStatus;
};

type CompanyOwnerRow = { id: string; name: string };

export function isBoostType(value: unknown): value is BoostType {
  return (
    typeof value === "string" &&
    (BOOST_TYPES as readonly string[]).includes(value)
  );
}

export async function getOwnedBoostJob(
  userId: string,
  jobId: string,
): Promise<OwnedBoostJob | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, company_id, title, boost, moderation_status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return null;

  const row = job as unknown as JobOwnershipRow;
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", row.company_id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (companyError) throw companyError;
  if (!company) return null;

  const companyRow = company as unknown as CompanyOwnerRow;
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: companyRow.name,
    title: row.title,
    boost: row.boost,
    moderationStatus: row.moderation_status,
  };
}

export async function createBoostCheckoutSession(params: {
  userId: string;
  jobId: string;
  boostType: BoostType;
}): Promise<BoostCheckoutResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };
  if (!isBoostType(params.boostType)) return { status: "invalid_type" };
  if (!isStripeCheckoutConfigured(params.boostType)) {
    return { status: "unavailable" };
  }

  let job: OwnedBoostJob | null;
  try {
    job = await getOwnedBoostJob(params.userId, params.jobId);
  } catch {
    console.error("[payments] boost ownership lookup failed");
    return { status: "error" };
  }
  if (!job) return { status: "not_allowed" };

  const priceId = getStripePriceId(params.boostType);
  const secretKey = getStripeSecretKey();
  if (!priceId || !secretKey) return { status: "unavailable" };

  const baseUrl = getSiteUrl();
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${baseUrl}/employer/jobs/${encodeURIComponent(job.id)}/boost?checkout=success`,
    cancel_url: `${baseUrl}/employer/jobs/${encodeURIComponent(job.id)}/boost?checkout=cancel`,
    client_reference_id: job.id,
    "metadata[job_id]": job.id,
    "metadata[company_id]": job.companyId,
    "metadata[boost_type]": params.boostType,
    "metadata[initiating_user_id]": params.userId,
  });

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = (await response.json()) as { url?: unknown };
    if (!response.ok || typeof data.url !== "string") {
      return { status: "error" };
    }
    return { status: "created", url: data.url };
  } catch {
    console.error("[payments] Stripe Checkout session creation failed");
    return { status: "error" };
  }
}

export async function activateBoostFromPaidCheckout(params: {
  jobId: string;
  companyId: string;
  boostType: BoostType;
}): Promise<BoostActivationResult> {
  if (!isBoostType(params.boostType)) return { status: "invalid" };
  if (!isSupabaseConfigured() || !isSupabaseServiceRoleConfigured()) {
    return { status: "unavailable" };
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("jobs")
      .update({ boost: params.boostType })
      .eq("id", params.jobId)
      .eq("company_id", params.companyId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data ? { status: "activated" } : { status: "not_found" };
  } catch {
    console.error("[payments] boost activation failed");
    return { status: "error" };
  }
}
