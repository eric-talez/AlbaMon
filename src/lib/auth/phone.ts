/**
 * Phone OTP sign-up/sign-in via Supabase Phone Auth.
 *
 * Uses only `signInWithOtp({ phone })` and
 * `verifyOtp({ phone, token, type: "sms" })` — the OTP itself is generated,
 * delivered (via the SMS provider configured in the Supabase dashboard), and
 * checked entirely by Supabase. This module never stores codes and never logs;
 * error messages are fixed constants with no phone/token/error interpolation.
 *
 * Phone verification only confirms control of the phone number — nothing
 * about identity, work authorization, or background. UI copy must not imply
 * more.
 */

export const RESEND_COOLDOWN_SECONDS = 60;

/** E.164: "+", a non-zero country-code digit, then 7-14 more digits. */
const E164_RE = /^\+[1-9][0-9]{7,14}$/;

const OTP_TOKEN_RE = /^[0-9]{6}$/;

export type PhoneAuthResult = { ok: true } | { ok: false; message: string };

export const PHONE_AUTH_MESSAGES = {
  invalidPhone:
    "국가번호를 포함한 휴대폰 번호를 입력해 주세요. 예: +1 213 555 0100 (Enter a valid phone number including the country code, e.g. +1 213 555 0100.)",
  invalidToken:
    "6자리 인증번호를 입력해 주세요. (Enter the 6-digit code.)",
  sendFailed:
    "인증번호 전송에 실패했습니다. 잠시 후 다시 시도해 주세요. (Could not send the code. Please try again shortly.)",
  verifyFailed:
    "인증에 실패했습니다. 인증번호를 확인해 주세요. (Verification failed. Check the code and try again.)",
  rateLimited:
    "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (Too many attempts. Please try again shortly.)",
} as const;

export interface PhoneOtpAuthClient {
  signInWithOtp(credentials: {
    phone: string;
  }): Promise<{ error: { status?: number } | null }>;
  verifyOtp(params: {
    phone: string;
    token: string;
    type: "sms";
  }): Promise<{ error: { status?: number } | null }>;
}

/**
 * Normalize user input to E.164 by stripping common formatting characters
 * (spaces, dashes, dots, parentheses). Returns null when the result is not a
 * plausible E.164 number.
 */
export function normalizePhoneNumber(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, "");
  return E164_RE.test(compact) ? compact : null;
}

/** True for exactly six ASCII digits. */
export function isValidOtpToken(raw: string): boolean {
  return OTP_TOKEN_RE.test(raw.trim());
}

/**
 * Seconds until "resend code" unlocks, clamped to [0, RESEND_COOLDOWN_SECONDS].
 * Pure so the countdown math is unit-testable; the component maps it onto a
 * 1-second interval.
 */
export function remainingCooldownSeconds(
  lastSentAtMs: number | null,
  nowMs: number,
): number {
  if (lastSentAtMs === null) return 0;
  const elapsedSeconds = (nowMs - lastSentAtMs) / 1000;
  const remaining = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
  return Math.min(RESEND_COOLDOWN_SECONDS, Math.max(0, remaining));
}

function failureMessage(
  error: { status?: number },
  fallback: string,
): string {
  return error.status === 429 ? PHONE_AUTH_MESSAGES.rateLimited : fallback;
}

/** Validate + normalize, then ask Supabase to send the SMS code. */
export async function sendPhoneOtp(
  auth: PhoneOtpAuthClient,
  rawPhone: string,
): Promise<PhoneAuthResult> {
  const phone = normalizePhoneNumber(rawPhone);
  if (phone === null) {
    return { ok: false, message: PHONE_AUTH_MESSAGES.invalidPhone };
  }

  try {
    const { error } = await auth.signInWithOtp({ phone });
    if (error) {
      return {
        ok: false,
        message: failureMessage(error, PHONE_AUTH_MESSAGES.sendFailed),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: PHONE_AUTH_MESSAGES.sendFailed };
  }
}

/** Validate locally, then let Supabase verify the code and set the session. */
export async function verifyPhoneOtp(
  auth: PhoneOtpAuthClient,
  rawPhone: string,
  rawToken: string,
): Promise<PhoneAuthResult> {
  const phone = normalizePhoneNumber(rawPhone);
  if (phone === null) {
    return { ok: false, message: PHONE_AUTH_MESSAGES.invalidPhone };
  }
  if (!isValidOtpToken(rawToken)) {
    return { ok: false, message: PHONE_AUTH_MESSAGES.invalidToken };
  }

  try {
    const { error } = await auth.verifyOtp({
      phone,
      token: rawToken.trim(),
      type: "sms",
    });
    if (error) {
      return {
        ok: false,
        message: failureMessage(error, PHONE_AUTH_MESSAGES.verifyFailed),
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: PHONE_AUTH_MESSAGES.verifyFailed };
  }
}
