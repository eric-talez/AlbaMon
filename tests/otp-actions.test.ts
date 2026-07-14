import { describe, it, expect, vi } from "vitest";
import {
  requestPhoneOtpCore,
  verifyPhoneOtpCore,
  type OtpActionDeps,
} from "@/lib/auth/otp-actions-core";
import type { PhoneOtpAuthClient } from "@/lib/auth/phone";
import type { RateLimitOutcome } from "@/lib/rate-limit/types";

const RAW_PHONE = "+1 213 555 0100";
const NORMALIZED = "+12135550100";
const IP = "203.0.113.9";

const ALLOW: RateLimitOutcome = { allowed: true, remaining: 5, retryAfterSeconds: 0 };
const DENY: RateLimitOutcome = { allowed: false, remaining: 0, retryAfterSeconds: 77 };

function fakeAuth(overrides: Partial<PhoneOtpAuthClient> = {}): PhoneOtpAuthClient {
  return {
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

function makeDeps(): {
  deps: OtpActionDeps;
  auth: PhoneOtpAuthClient;
  enforce: ReturnType<typeof vi.fn>;
  getAuthClient: ReturnType<typeof vi.fn>;
} {
  const auth = fakeAuth();
  const enforce = vi.fn(async () => ALLOW);
  const getAuthClient = vi.fn(async () => auth);
  const deps: OtpActionDeps = {
    isPhoneAuthEnabled: () => true,
    getClientIp: async () => IP,
    enforce: enforce as OtpActionDeps["enforce"],
    getAuthClient: getAuthClient as OtpActionDeps["getAuthClient"],
  };
  return { deps, auth, enforce, getAuthClient };
}

describe("requestPhoneOtpCore", () => {
  it("returns an error and calls nothing when phone auth is disabled", async () => {
    const { deps, enforce, getAuthClient } = makeDeps();
    deps.isPhoneAuthEnabled = () => false;
    const result = await requestPhoneOtpCore(deps, RAW_PHONE);
    expect(result.status).toBe("error");
    expect(enforce).not.toHaveBeenCalled();
    expect(getAuthClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone before rate limiting or Supabase", async () => {
    const { deps, enforce } = makeDeps();
    const result = await requestPhoneOtpCore(deps, "not-a-number");
    expect(result.status).toBe("error");
    expect(enforce).not.toHaveBeenCalled();
  });

  it("consumes buckets IP→phone→phoneDaily before sending", async () => {
    const { deps, enforce, getAuthClient } = makeDeps();
    await requestPhoneOtpCore(deps, RAW_PHONE);
    const steps = enforce.mock.calls[0][0];
    expect(steps.map((s: { policy: { scope: string } }) => s.policy.scope)).toEqual([
      "otp_send_ip",
      "otp_send_phone",
      "otp_send_phone_daily",
    ]);
    expect(steps[0]).toMatchObject({ domain: "ip", value: IP });
    expect(steps[1]).toMatchObject({ domain: "phone", value: NORMALIZED });
    expect(getAuthClient).toHaveBeenCalledTimes(1);
  });

  it("when rate limited, returns rate_limited and NEVER calls Supabase", async () => {
    const getAuthClient = vi.fn(async () => fakeAuth());
    const deps: OtpActionDeps = {
      isPhoneAuthEnabled: () => true,
      getClientIp: async () => IP,
      enforce: async () => DENY,
      getAuthClient,
    };
    const result = await requestPhoneOtpCore(deps, RAW_PHONE);
    expect(result).toEqual({
      status: "rate_limited",
      retryAfterSeconds: 77,
      message: expect.any(String),
    });
    expect(getAuthClient).not.toHaveBeenCalled();
    // The fixed message carries no phone number.
    if (result.status === "rate_limited") {
      expect(result.message).not.toContain("2135550100");
    }
  });

  it("returns ok after a successful send", async () => {
    const { deps } = makeDeps();
    const result = await requestPhoneOtpCore(deps, RAW_PHONE);
    expect(result).toEqual({ status: "ok" });
  });
});

describe("verifyPhoneOtpCore", () => {
  it("rejects a non-6-digit token before rate limiting or Supabase", async () => {
    const { deps, enforce } = makeDeps();
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123");
    expect(result.status).toBe("error");
    expect(enforce).not.toHaveBeenCalled();
  });

  it("consumes verify buckets IP→phone before verifying", async () => {
    const { deps, enforce } = makeDeps();
    await verifyPhoneOtpCore(deps, RAW_PHONE, "123456");
    const steps = enforce.mock.calls[0][0];
    expect(steps.map((s: { policy: { scope: string } }) => s.policy.scope)).toEqual([
      "otp_verify_ip",
      "otp_verify_phone",
    ]);
  });

  it("when rate limited, returns rate_limited and NEVER calls Supabase", async () => {
    const getAuthClient = vi.fn(async () => fakeAuth());
    const deps: OtpActionDeps = {
      isPhoneAuthEnabled: () => true,
      getClientIp: async () => IP,
      enforce: async () => DENY,
      getAuthClient,
    };
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123456", "/employer");
    expect(result.status).toBe("rate_limited");
    expect(getAuthClient).not.toHaveBeenCalled();
  });

  it("returns ok with the SERVER-sanitized next on success", async () => {
    const { deps } = makeDeps();
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123456", "/employer/jobs");
    expect(result).toEqual({ status: "ok", next: "/employer/jobs" });
  });

  it("sanitizes an unsafe next on the server (never trusts the client)", async () => {
    const { deps } = makeDeps();
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123456", "//evil.com");
    expect(result).toEqual({ status: "ok", next: "/dashboard" });
  });

  it("returns an error (not ok) when Supabase verification fails", async () => {
    const auth = fakeAuth({ verifyOtp: vi.fn(async () => ({ error: { status: 401 } })) });
    const deps: OtpActionDeps = {
      isPhoneAuthEnabled: () => true,
      getClientIp: async () => IP,
      enforce: async () => ALLOW,
      getAuthClient: async () => auth,
    };
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123456");
    expect(result.status).toBe("error");
  });

  it("does NOT report success when the cookie write throws during verify", async () => {
    // The strict server-action client throws on a cookie-write failure; verifyOtp
    // surfaces it, and the core must return an error, never { status: "ok" }.
    const auth = fakeAuth({
      verifyOtp: vi.fn(async () => {
        throw new Error("cookie write failed");
      }),
    });
    const deps: OtpActionDeps = {
      isPhoneAuthEnabled: () => true,
      getClientIp: async () => IP,
      enforce: async () => ALLOW,
      getAuthClient: async () => auth,
    };
    const result = await verifyPhoneOtpCore(deps, RAW_PHONE, "123456", "/dashboard");
    expect(result.status).toBe("error");
  });
});
