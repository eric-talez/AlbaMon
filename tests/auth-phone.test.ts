import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidOtpToken,
  normalizePhoneNumber,
  PHONE_AUTH_MESSAGES,
  remainingCooldownSeconds,
  RESEND_COOLDOWN_SECONDS,
  sendPhoneOtp,
  verifyPhoneOtp,
  type PhoneOtpAuthClient,
} from "@/lib/auth/phone";

/**
 * Slice 19 phone OTP helpers: Supabase is called with exactly
 * `signInWithOtp({ phone })` / `verifyOtp({ phone, token, type: "sms" })`,
 * invalid input never reaches the network, and — the privacy contract —
 * no phone number, code, or upstream error detail ever appears in a result
 * message or on the console.
 */

const PHONE = "+12135550100";
const TOKEN = "123456";

function fakeAuth(
  error: { status?: number; message?: string } | null = null,
): {
  auth: PhoneOtpAuthClient;
  sendSpy: ReturnType<typeof vi.fn>;
  verifySpy: ReturnType<typeof vi.fn>;
} {
  const sendSpy = vi.fn(async () => ({ error }));
  const verifySpy = vi.fn(async () => ({ error }));
  return {
    auth: { signInWithOtp: sendSpy, verifyOtp: verifySpy },
    sendSpy,
    verifySpy,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizePhoneNumber", () => {
  it.each([
    ["+12135550100", "+12135550100"],
    ["+1 (213) 555-0100", "+12135550100"],
    ["+82 10-1234-5678", "+821012345678"],
    ["+44 20.7946.0958", "+442079460958"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizePhoneNumber(raw)).toBe(expected);
  });

  it.each([
    "2135550100", // no +country code
    "+02135550100", // country code cannot start with 0
    "+1234567", // too short
    "+1234567890123456", // too long
    "+1213555O100", // letter O, not a digit
    "12135550100",
    "",
    "+",
  ])("rejects %j", (raw) => {
    expect(normalizePhoneNumber(raw)).toBeNull();
  });
});

describe("isValidOtpToken", () => {
  it("accepts exactly six digits", () => {
    expect(isValidOtpToken("123456")).toBe(true);
    expect(isValidOtpToken(" 123456 ")).toBe(true);
  });

  it.each(["12345", "1234567", "abcdef", "12 456", ""])(
    "rejects %j",
    (raw) => {
      expect(isValidOtpToken(raw)).toBe(false);
    },
  );
});

describe("remainingCooldownSeconds", () => {
  const NOW = 1_750_000_000_000;

  it("is 0 before anything was sent", () => {
    expect(remainingCooldownSeconds(null, NOW)).toBe(0);
  });

  it("counts down from the full cooldown", () => {
    expect(remainingCooldownSeconds(NOW, NOW)).toBe(RESEND_COOLDOWN_SECONDS);
    expect(remainingCooldownSeconds(NOW - 30_000, NOW)).toBe(30);
    expect(remainingCooldownSeconds(NOW - 59_500, NOW)).toBe(1);
  });

  it("is 0 once the cooldown elapsed", () => {
    expect(remainingCooldownSeconds(NOW - 60_000, NOW)).toBe(0);
    expect(remainingCooldownSeconds(NOW - 3_600_000, NOW)).toBe(0);
  });

  it("clamps to the cooldown ceiling under clock skew", () => {
    expect(remainingCooldownSeconds(NOW + 60_000, NOW)).toBe(
      RESEND_COOLDOWN_SECONDS,
    );
  });
});

describe("sendPhoneOtp", () => {
  it("calls signInWithOtp with exactly the normalized phone", async () => {
    const { auth, sendSpy } = fakeAuth();
    const result = await sendPhoneOtp(auth, "+1 (213) 555-0100");
    expect(result).toEqual({ ok: true });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({ phone: PHONE });
  });

  it("never calls Supabase for an invalid number", async () => {
    const { auth, sendSpy } = fakeAuth();
    const result = await sendPhoneOtp(auth, "not-a-number");
    expect(result).toEqual({
      ok: false,
      message: PHONE_AUTH_MESSAGES.invalidPhone,
    });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("maps a 429 to the rate-limit message", async () => {
    const { auth } = fakeAuth({ status: 429, message: "over quota" });
    const result = await sendPhoneOtp(auth, PHONE);
    expect(result).toEqual({
      ok: false,
      message: PHONE_AUTH_MESSAGES.rateLimited,
    });
  });

  it("maps other errors to the generic send failure", async () => {
    const { auth } = fakeAuth({ status: 500, message: "sms provider down" });
    const result = await sendPhoneOtp(auth, PHONE);
    expect(result).toEqual({
      ok: false,
      message: PHONE_AUTH_MESSAGES.sendFailed,
    });
  });

  it("catches a throwing client without leaking the error", async () => {
    const auth: PhoneOtpAuthClient = {
      signInWithOtp: async () => {
        throw new Error(`network blew up for ${PHONE}`);
      },
      verifyOtp: async () => ({ error: null }),
    };
    const result = await sendPhoneOtp(auth, PHONE);
    expect(result).toEqual({
      ok: false,
      message: PHONE_AUTH_MESSAGES.sendFailed,
    });
  });
});

describe("verifyPhoneOtp", () => {
  it("calls verifyOtp with exactly phone, token, and type sms", async () => {
    const { auth, verifySpy } = fakeAuth();
    const result = await verifyPhoneOtp(auth, "+1 213 555 0100", " 123456 ");
    expect(result).toEqual({ ok: true });
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(verifySpy).toHaveBeenCalledWith({
      phone: PHONE,
      token: TOKEN,
      type: "sms",
    });
  });

  it.each(["12345", "abcdef", ""])(
    "never calls Supabase for invalid token %j",
    async (token) => {
      const { auth, verifySpy } = fakeAuth();
      const result = await verifyPhoneOtp(auth, PHONE, token);
      expect(result).toEqual({
        ok: false,
        message: PHONE_AUTH_MESSAGES.invalidToken,
      });
      expect(verifySpy).not.toHaveBeenCalled();
    },
  );

  it("maps a failed verification to the generic verify message", async () => {
    const { auth } = fakeAuth({ status: 401, message: "otp expired" });
    const result = await verifyPhoneOtp(auth, PHONE, TOKEN);
    expect(result).toEqual({
      ok: false,
      message: PHONE_AUTH_MESSAGES.verifyFailed,
    });
  });
});

describe("privacy contract: no phone/token/error leakage", () => {
  it("failure messages never contain the phone number, token, or upstream error text", async () => {
    const upstream = { status: 500, message: "twilio said no" };
    const { auth } = fakeAuth(upstream);

    const results = [
      await sendPhoneOtp(auth, PHONE),
      await verifyPhoneOtp(auth, PHONE, TOKEN),
      await sendPhoneOtp(auth, "definitely-invalid"),
      await verifyPhoneOtp(auth, PHONE, "999"),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).not.toContain("2135550100");
        expect(result.message).not.toContain(TOKEN);
        expect(result.message).not.toContain("999");
        expect(result.message).not.toContain(upstream.message);
      }
    }
  });

  it("helpers never write to the console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const failing = fakeAuth({ status: 500, message: "boom" });
    await sendPhoneOtp(failing.auth, PHONE);
    await verifyPhoneOtp(failing.auth, PHONE, TOKEN);
    await sendPhoneOtp(failing.auth, "invalid");
    const throwing: PhoneOtpAuthClient = {
      signInWithOtp: async () => {
        throw new Error("boom");
      },
      verifyOtp: async () => {
        throw new Error("boom");
      },
    };
    await sendPhoneOtp(throwing, PHONE);
    await verifyPhoneOtp(throwing, PHONE, TOKEN);

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
