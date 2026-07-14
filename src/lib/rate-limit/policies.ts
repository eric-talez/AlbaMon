/**
 * Typed rate-limit policy registry (Slice 28) — the single source of truth for
 * every limit. Pure constants; no secret or environment access.
 *
 * Consumption ORDER matters for the OTP flows: the coarse per-IP bucket is
 * consumed BEFORE the fine per-phone buckets so an exhausted IP can never create
 * unbounded per-phone bucket rows with attacker-chosen numbers. The ordering is
 * expressed by the caller (see `src/lib/auth/otp-actions.ts`) and pinned by tests.
 */
import type { RateLimitPolicy } from "@/lib/rate-limit/types";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function policy(
  scope: string,
  maxAttempts: number,
  windowSeconds: number,
): RateLimitPolicy {
  return { scope, maxAttempts, windowSeconds };
}

export const RATE_LIMIT_POLICIES = {
  // Phone OTP send — consume order: ip → phone → phoneDaily.
  otpSendPerIp: policy("otp_send_ip", 10, 15 * MINUTE),
  otpSendPerPhone: policy("otp_send_phone", 3, 15 * MINUTE),
  otpSendPerPhoneDaily: policy("otp_send_phone_daily", 10, DAY),

  // Phone OTP verify — consume order: ip → phone.
  otpVerifyPerIp: policy("otp_verify_ip", 30, 15 * MINUTE),
  otpVerifyPerPhone: policy("otp_verify_phone", 10, 15 * MINUTE),

  // Authenticated write actions (keyed per user / per employer).
  submitApplication: policy("app_submit_user", 10, HOUR),
  createReport: policy("report_create_user", 5, HOUR),
  sendMessage: policy("message_send_user", 30, MINUTE),
  employerAccessRequest: policy("employer_access_request_user", 3, DAY),
  createJob: policy("job_create_employer", 20, DAY),
  createCompany: policy("company_create_employer", 5, DAY),
} as const;

export type RateLimitPolicyKey = keyof typeof RATE_LIMIT_POLICIES;
