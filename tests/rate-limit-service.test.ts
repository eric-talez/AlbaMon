import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";
import type { RateLimitStore } from "@/lib/rate-limit/types";

// Mock the service-role client module so no hosted service is needed. Individual
// tests control configuration + the RPC payload.
vi.mock("@/lib/supabase/service", () => ({
  isSupabaseServiceRoleConfigured: vi.fn(() => true),
  createSupabaseServiceRoleClient: vi.fn(),
}));

import {
  isSupabaseServiceRoleConfigured,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/service";
import { enforcePolicies } from "@/lib/rate-limit/service";

const HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const IP_STEP = {
  policy: RATE_LIMIT_POLICIES.otpSendPerIp,
  domain: "ip" as const,
  value: "203.0.113.9",
};
const PHONE_STEP = {
  policy: RATE_LIMIT_POLICIES.otpSendPerPhone,
  domain: "phone" as const,
  value: "+12135550100",
};
const PHONE_DAY_STEP = {
  policy: RATE_LIMIT_POLICIES.otpSendPerPhoneDaily,
  domain: "phone" as const,
  value: "+12135550100",
};

function storeThatAllows(): RateLimitStore {
  return { consume: vi.fn(async () => ({ allowed: true, remaining: 2, retryAfterSeconds: 0 })) };
}

beforeEach(() => {
  vi.mocked(isSupabaseServiceRoleConfigured).mockReturnValue(true);
  vi.stubEnv("RATE_LIMIT_HMAC_SECRET", HEX);
  // Default: non-production runtime.
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(createSupabaseServiceRoleClient).mockReset();
});

describe("enforcePolicies — injected store", () => {
  it("allows when every step passes and returns the last outcome", async () => {
    const store = storeThatAllows();
    const outcome = await enforcePolicies([IP_STEP, PHONE_STEP], store);
    expect(outcome.allowed).toBe(true);
    expect(store.consume).toHaveBeenCalledTimes(2);
  });

  it("denies with the denying step's own retry hint", async () => {
    const store: RateLimitStore = {
      consume: vi.fn(async () => ({ allowed: false, remaining: 0, retryAfterSeconds: 42 })),
    };
    const outcome = await enforcePolicies([IP_STEP], store);
    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBe(42);
  });

  it("consumes sequentially and SHORT-CIRCUITS on the first denial", async () => {
    const calls: string[] = [];
    const store: RateLimitStore = {
      consume: vi.fn(async (scope: string) => {
        calls.push(scope);
        if (scope === RATE_LIMIT_POLICIES.otpSendPerIp.scope) {
          return { allowed: false, remaining: 0, retryAfterSeconds: 100 };
        }
        return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
      }),
    };
    const outcome = await enforcePolicies([IP_STEP, PHONE_STEP, PHONE_DAY_STEP], store);
    expect(outcome.allowed).toBe(false);
    // Only the IP bucket was consumed; the phone buckets were never touched.
    expect(calls).toEqual([RATE_LIMIT_POLICIES.otpSendPerIp.scope]);
  });

  it("consumes in coarse→fine order when all allow", async () => {
    const calls: string[] = [];
    const store: RateLimitStore = {
      consume: vi.fn(async (scope: string) => {
        calls.push(scope);
        return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
      }),
    };
    await enforcePolicies([IP_STEP, PHONE_STEP, PHONE_DAY_STEP], store);
    expect(calls).toEqual([
      RATE_LIMIT_POLICIES.otpSendPerIp.scope,
      RATE_LIMIT_POLICIES.otpSendPerPhone.scope,
      RATE_LIMIT_POLICIES.otpSendPerPhoneDaily.scope,
    ]);
  });
});

describe("enforcePolicies — fail policy", () => {
  it("fails OPEN in local dev/test when the HMAC secret is missing", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    const store = storeThatAllows();
    const outcome = await enforcePolicies([IP_STEP], store);
    expect(outcome.allowed).toBe(true);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("fails CLOSED in production when the HMAC secret is missing", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    const store = storeThatAllows();
    const outcome = await enforcePolicies([IP_STEP], store);
    expect(outcome.allowed).toBe(false);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("fails CLOSED in a Vercel PREVIEW runtime when the secret is missing", async () => {
    vi.stubEnv("RATE_LIMIT_HMAC_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    const outcome = await enforcePolicies([IP_STEP], storeThatAllows());
    expect(outcome.allowed).toBe(false);
  });

  it("fails CLOSED in production when the service role is unconfigured", async () => {
    vi.mocked(isSupabaseServiceRoleConfigured).mockReturnValue(false);
    vi.stubEnv("VERCEL_ENV", "production");
    const store = storeThatAllows();
    const outcome = await enforcePolicies([IP_STEP], store);
    expect(outcome.allowed).toBe(false);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("fails CLOSED in production when the store throws (RPC error)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const store: RateLimitStore = {
      consume: vi.fn(async () => {
        throw new Error("rpc_error");
      }),
    };
    const outcome = await enforcePolicies([IP_STEP], store);
    expect(outcome.allowed).toBe(false);
  });

  it("logs a fixed [rate-limit] string with NO caught error object", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VERCEL_ENV", "preview");
    await enforcePolicies([IP_STEP], {
      consume: vi.fn(async () => {
        throw new Error("boom secret detail");
      }),
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const args = warn.mock.calls[0];
    expect(args).toHaveLength(1); // single string arg — never the Error object
    expect(String(args[0])).toMatch(/^\[rate-limit\] /);
    expect(String(args[0])).not.toContain("boom secret detail");
  });
});

describe("enforcePolicies — default store validates the RPC shape", () => {
  function mockRpc(data: unknown): void {
    vi.mocked(createSupabaseServiceRoleClient).mockReturnValue({
      rpc: vi.fn(async () => ({ data, error: null })),
    } as unknown as ReturnType<typeof createSupabaseServiceRoleClient>);
  }

  it("parses a valid single-row result", async () => {
    mockRpc([{ allowed: true, remaining: 4, retry_after_seconds: 0 }]);
    const outcome = await enforcePolicies([IP_STEP]); // real default store
    expect(outcome.allowed).toBe(true);
    expect(outcome.remaining).toBe(4);
  });

  it.each([
    ["empty array", []],
    ["multiple rows", [{ allowed: true, remaining: 1, retry_after_seconds: 0 }, { allowed: false, remaining: 0, retry_after_seconds: 5 }]],
    ["non-boolean allowed", [{ allowed: "yes", remaining: 1, retry_after_seconds: 0 }]],
    ["negative remaining", [{ allowed: true, remaining: -1, retry_after_seconds: 0 }]],
    ["non-integer retry", [{ allowed: false, remaining: 0, retry_after_seconds: 1.5 }]],
    ["not an array", { allowed: true, remaining: 1, retry_after_seconds: 0 }],
  ])("fails CLOSED in production on a malformed result: %s", async (_label, data) => {
    vi.stubEnv("VERCEL_ENV", "production");
    mockRpc(data);
    const outcome = await enforcePolicies([IP_STEP]);
    expect(outcome.allowed).toBe(false);
  });
});
