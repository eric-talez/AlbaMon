import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Slice 19 security property: the `?next=` return path is attacker-suppliable
 * and must never produce a cross-origin redirect — not from the OAuth
 * callback, not from dev sign-in, not from client-side navigation. All
 * consumers share `sanitizeNextPath`, pinned here including the sneaky
 * variants (protocol-relative `//`, backslash `/\`, control characters that
 * WHATWG URL parsing strips back into a `//` bypass).
 */

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
vi.mock("@/lib/auth/dev-session", () => ({
  writeDevSession: vi.fn(async () => {}),
  clearDevSession: vi.fn(async () => {}),
}));

import {
  DEFAULT_AUTH_REDIRECT,
  isSafeNextPath,
  sanitizeNextPath,
} from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GET as authCallback } from "@/app/auth/callback/route";
import { signInDev } from "@/lib/auth/actions";

const mockServerClient = vi.mocked(createSupabaseServerClient);

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";
const PLACEHOLDER_URL = "https://your-project.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sanitizeNextPath / isSafeNextPath", () => {
  it.each(["/", "/dashboard", "/jobs?a=1#b", "/jobs/some-job-id_1"])(
    "accepts same-site relative path %j",
    (path) => {
      expect(isSafeNextPath(path)).toBe(true);
      expect(sanitizeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    "",
    "dashboard",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\nevil.example",
    "/\n/evil.example",
    "/\tevil.example",
  ])("falls back to the dashboard for %j", (raw) => {
    expect(isSafeNextPath(raw)).toBe(false);
    expect(sanitizeNextPath(raw)).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it("rejects non-string values", () => {
    expect(isSafeNextPath(42)).toBe(false);
    expect(isSafeNextPath({ path: "/jobs" })).toBe(false);
  });

  it("rejects every ASCII control character anywhere in the path", () => {
    for (let code = 0; code < 0x20; code += 1) {
      expect(isSafeNextPath(`/jobs${String.fromCharCode(code)}x`)).toBe(false);
    }
  });

  it("honors a custom fallback", () => {
    expect(sanitizeNextPath("//evil.example", "/")).toBe("/");
    expect(sanitizeNextPath(undefined, "/jobs")).toBe("/jobs");
  });
});

describe("GET /auth/callback", () => {
  function request(query: string): NextRequest {
    return new NextRequest(`http://localhost:3000/auth/callback${query}`);
  }

  function useExchangeResult(error: unknown): ReturnType<typeof vi.fn> {
    const exchangeCodeForSession = vi.fn(async () => ({ error }));
    mockServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return exchangeCodeForSession;
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);
  });

  it("redirects to a safe next path after a successful exchange", async () => {
    const exchange = useExchangeResult(null);
    const response = await authCallback(request("?code=abc&next=/jobs"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/jobs",
    );
    expect(exchange).toHaveBeenCalledWith("abc");
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
  ])("falls back to the dashboard for next=%s", async (next) => {
    useExchangeResult(null);
    const response = await authCallback(
      request(`?code=abc&next=${encodeURIComponent(next)}`),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard",
    );
  });

  it("redirects to /login?error=auth_callback when the exchange fails", async () => {
    useExchangeResult({ message: "bad code" });
    const response = await authCallback(request("?code=abc&next=/jobs"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=auth_callback",
    );
  });

  it("redirects to /login without touching Supabase when no code is present", async () => {
    const exchange = useExchangeResult(null);
    const response = await authCallback(request("?next=/jobs"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it("redirects to /login when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PLACEHOLDER_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", PLACEHOLDER_KEY);
    const response = await authCallback(request("?code=abc&next=/jobs"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
    expect(mockServerClient).not.toHaveBeenCalled();
  });
});

describe("signInDev next hardening (dev mode)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PLACEHOLDER_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", PLACEHOLDER_KEY);
  });

  function devForm(next: string): FormData {
    const form = new FormData();
    form.set("role", "seeker");
    form.set("next", next);
    return form;
  }

  it("preserves a safe next path", async () => {
    await expect(signInDev(devForm("/jobs"))).rejects.toThrow(
      "REDIRECT:/jobs",
    );
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example"])(
    "ignores unsafe next=%s and lands on the role home",
    async (next) => {
      await expect(signInDev(devForm(next))).rejects.toThrow(
        "REDIRECT:/dashboard",
      );
    },
  );
});
