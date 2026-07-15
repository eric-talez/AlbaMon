/**
 * Framework-free core of the server-boundary phone OTP flow (Slice 28).
 *
 * NO `server-only` / Next.js imports so it is directly unit-testable: every
 * side-effecting dependency (env gate, client IP, rate limiter, Supabase auth
 * client) is injected. The `"use server"` wrappers live in `otp-actions.ts`.
 *
 * Rate limits are consumed BEFORE any Supabase Auth call, coarse→fine
 * (IP before phone), short-circuiting on the first denial — so a rejected
 * request never reaches the SMS provider. Phone numbers, OTP codes, IPs, and
 * Supabase responses are never logged here.
 */
import {
  PHONE_AUTH_MESSAGES,
  isValidOtpToken,
  normalizePhoneNumber,
  sendPhoneOtp,
  verifyPhoneOtp,
  type PhoneOtpAuthClient,
} from "@/lib/auth/phone";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";
import { rateLimitedResult } from "@/lib/rate-limit/types";
import type { RateLimitOutcome, RateLimitStep } from "@/lib/rate-limit/types";
import type { RequestOtpResult, VerifyOtpResult } from "@/lib/auth/otp-types";

export interface OtpActionDeps {
  isPhoneAuthEnabled: () => boolean;
  getClientIp: () => Promise<string>;
  enforce: (steps: readonly RateLimitStep[]) => Promise<RateLimitOutcome>;
  getAuthClient: () => Promise<PhoneOtpAuthClient>;
}

/** Request an OTP: validate → rate-limit (IP → phone → phone/day) → send. */
export async function requestPhoneOtpCore(
  deps: OtpActionDeps,
  rawPhone: string,
): Promise<RequestOtpResult> {
  if (!deps.isPhoneAuthEnabled()) {
    return { status: "error", message: PHONE_AUTH_MESSAGES.sendFailed };
  }
  const phone = normalizePhoneNumber(rawPhone);
  if (phone === null) {
    return { status: "error", message: PHONE_AUTH_MESSAGES.invalidPhone };
  }

  const ip = await deps.getClientIp();
  const outcome = await deps.enforce([
    { policy: RATE_LIMIT_POLICIES.otpSendPerIp, domain: "ip", value: ip },
    { policy: RATE_LIMIT_POLICIES.otpSendPerPhone, domain: "phone", value: phone },
    { policy: RATE_LIMIT_POLICIES.otpSendPerPhoneDaily, domain: "phone", value: phone },
  ]);
  if (!outcome.allowed) return rateLimitedResult(outcome.retryAfterSeconds);

  const auth = await deps.getAuthClient();
  const result = await sendPhoneOtp(auth, phone);
  return result.ok
    ? { status: "ok" }
    : { status: "error", message: result.message };
}

/** Verify an OTP: validate → rate-limit (IP → phone) → verify → sanitize next. */
export async function verifyPhoneOtpCore(
  deps: OtpActionDeps,
  rawPhone: string,
  rawToken: string,
  rawNext?: string,
): Promise<VerifyOtpResult> {
  if (!deps.isPhoneAuthEnabled()) {
    return { status: "error", message: PHONE_AUTH_MESSAGES.verifyFailed };
  }
  const phone = normalizePhoneNumber(rawPhone);
  if (phone === null) {
    return { status: "error", message: PHONE_AUTH_MESSAGES.invalidPhone };
  }
  if (!isValidOtpToken(rawToken)) {
    return { status: "error", message: PHONE_AUTH_MESSAGES.invalidToken };
  }

  const ip = await deps.getClientIp();
  const outcome = await deps.enforce([
    { policy: RATE_LIMIT_POLICIES.otpVerifyPerIp, domain: "ip", value: ip },
    { policy: RATE_LIMIT_POLICIES.otpVerifyPerPhone, domain: "phone", value: phone },
  ]);
  if (!outcome.allowed) return rateLimitedResult(outcome.retryAfterSeconds);

  // The strict server-action client's cookie write throws on failure, which
  // verifyPhoneOtp turns into { ok: false } — so we only report success when the
  // session cookies were actually established. `next` is sanitized server-side.
  const auth = await deps.getAuthClient();
  const result = await verifyPhoneOtp(auth, phone, rawToken);
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "ok", next: sanitizeNextPath(rawNext) };
}
