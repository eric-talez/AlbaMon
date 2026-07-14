"use server";

/**
 * Server-boundary phone OTP actions (Slice 28).
 *
 * The browser no longer calls Supabase `signInWithOtp`/`verifyOtp` directly.
 * These cookie-aware Server Actions run durable rate limiting first (per IP and
 * per phone), then call the ordinary anon Supabase Auth client — NEVER the
 * service-role key. They are passed to the client form as props from the
 * `AuthCard` Server Component, so no Client Component imports this module.
 */
import { isPhoneAuthEnabled } from "@/lib/auth/providers";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { getTrustedClientIp } from "@/lib/rate-limit/client-ip";
import { enforcePolicies } from "@/lib/rate-limit/service";
import {
  requestPhoneOtpCore,
  verifyPhoneOtpCore,
  type OtpActionDeps,
} from "@/lib/auth/otp-actions-core";
import type { RequestOtpResult, VerifyOtpResult } from "@/lib/auth/otp-types";

const deps: OtpActionDeps = {
  isPhoneAuthEnabled,
  getClientIp: getTrustedClientIp,
  enforce: (steps) => enforcePolicies(steps),
  getAuthClient: async () => (await createSupabaseServerActionClient()).auth,
};

export async function requestPhoneOtp(
  rawPhone: string,
): Promise<RequestOtpResult> {
  return requestPhoneOtpCore(deps, rawPhone);
}

export async function verifyPhoneOtpAction(
  rawPhone: string,
  rawToken: string,
  rawNext?: string,
): Promise<VerifyOtpResult> {
  return verifyPhoneOtpCore(deps, rawPhone, rawToken, rawNext);
}
