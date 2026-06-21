import { afterEach, describe, it, expect, vi } from "vitest";
import {
  isSupabaseConfigured,
  isDevAuthEnabled,
  assertAuthConfiguredForProduction,
} from "@/lib/supabase/config";
import {
  decodeDevSession,
  encodeDevSession,
} from "@/lib/auth/dev-session-core";

/**
 * These tests pin down the single most important security property of Slice 2:
 * the unsigned dev-auth cookie must be COMPLETELY inert in production.
 */

const PLACEHOLDER_URL = "https://your-project.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";
const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";

type EnvShape = {
  nodeEnv: "production" | "development" | "test";
  url?: string; // omit to simulate a missing var
  key?: string;
};

function setEnv({ nodeEnv, url, key }: EnvShape): void {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", key ?? "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevAuthEnabled — when dev auth may run", () => {
  it("ENABLED in non-production with placeholder env", () => {
    setEnv({ nodeEnv: "development", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    expect(isSupabaseConfigured()).toBe(false);
    expect(isDevAuthEnabled()).toBe(true);
  });

  it("DISABLED in production even with placeholder env", () => {
    setEnv({ nodeEnv: "production", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    expect(isDevAuthEnabled()).toBe(false);
  });

  it("DISABLED in production with missing env", () => {
    setEnv({ nodeEnv: "production" });
    expect(isSupabaseConfigured()).toBe(false);
    expect(isDevAuthEnabled()).toBe(false);
  });

  it("DISABLED when Supabase is configured (real auth takes over)", () => {
    setEnv({ nodeEnv: "development", url: REAL_URL, key: REAL_KEY });
    expect(isSupabaseConfigured()).toBe(true);
    expect(isDevAuthEnabled()).toBe(false);
  });
});

describe("assertAuthConfiguredForProduction — fail closed", () => {
  it("throws in production when Supabase is missing", () => {
    setEnv({ nodeEnv: "production" });
    expect(() => assertAuthConfiguredForProduction()).toThrow();
  });

  it("throws in production with placeholder env", () => {
    setEnv({ nodeEnv: "production", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    expect(() => assertAuthConfiguredForProduction()).toThrow();
  });

  it("does NOT throw in production when Supabase is configured", () => {
    setEnv({ nodeEnv: "production", url: REAL_URL, key: REAL_KEY });
    expect(() => assertAuthConfiguredForProduction()).not.toThrow();
  });

  it("does NOT throw in development (dev-auth fallback is allowed)", () => {
    setEnv({ nodeEnv: "development", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    expect(() => assertAuthConfiguredForProduction()).not.toThrow();
  });
});

describe("dev cookie cannot authenticate in production", () => {
  const adminCookie = encodeDevSession({
    id: "dev-admin",
    email: "admin@dev.local",
    role: "admin",
  });

  it("a forged admin dev cookie yields null when dev-auth is disabled", () => {
    // `allowDevAuth = false` models the production gate (isDevAuthEnabled()).
    expect(decodeDevSession(adminCookie, false)).toBeNull();
  });

  it("production env => isDevAuthEnabled() false => admin cookie is inert", () => {
    setEnv({ nodeEnv: "production", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    expect(decodeDevSession(adminCookie, isDevAuthEnabled())).toBeNull();
  });

  it("development env => the same admin cookie decodes (dev convenience)", () => {
    setEnv({ nodeEnv: "development", url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY });
    const user = decodeDevSession(adminCookie, isDevAuthEnabled());
    expect(user).toEqual({
      id: "dev-admin",
      email: "admin@dev.local",
      role: "admin",
      isDev: true,
    });
  });

  it("rejects structurally invalid cookies even in dev", () => {
    expect(decodeDevSession("not-base64-or-json", true)).toBeNull();
    const badRole = encodeDevSession({
      id: "x",
      email: "x@dev.local",
      // @ts-expect-error — intentionally invalid role for the test
      role: "superuser",
    });
    expect(decodeDevSession(badRole, true)).toBeNull();
  });
});
