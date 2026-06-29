"use server";

import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/guards";
import { createBoostCheckoutSession, isBoostType } from "@/lib/payments/boosts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boostPath(jobId: string, status: string): string {
  return `/employer/jobs/${encodeURIComponent(jobId)}/boost?checkout=${encodeURIComponent(status)}`;
}

export async function startBoostCheckout(formData: FormData): Promise<void> {
  const rawJobId = formData.get("jobId");
  const rawBoostType = formData.get("boostType");
  const jobId = typeof rawJobId === "string" ? rawJobId : "";
  if (!UUID_PATTERN.test(jobId) || !isBoostType(rawBoostType)) {
    redirect("/employer/jobs?boost=invalid");
  }

  const user = await requireArea("employer", `/employer/jobs/${jobId}/boost`);
  const result = await createBoostCheckoutSession({
    userId: user.id,
    jobId,
    boostType: rawBoostType,
  });

  if (result.status === "created") redirect(result.url);
  redirect(boostPath(jobId, result.status));
}
