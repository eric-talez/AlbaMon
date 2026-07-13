import { describe, it, expect, vi } from "vitest";
import {
  buildSecurityHeaders,
  buildContentSecurityPolicy,
  supabaseConnectOrigins,
  type HttpHeader,
  type SecurityHeaderOptions,
} from "@/lib/security/headers";

const SAMPLE_URL = "https://abcdefgh.supabase.co";
const prod: SecurityHeaderOptions = {
  isProduction: true,
  supabaseUrl: SAMPLE_URL,
};
const dev: SecurityHeaderOptions = {
  isProduction: false,
  supabaseUrl: SAMPLE_URL,
};

function keyCounts(headers: HttpHeader[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { key } of headers) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

/** The value of a single CSP directive, e.g. directive("script-src", csp). */
function directive(name: string, csp: string): string | undefined {
  return csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
}

const cspOf = (opts: SecurityHeaderOptions): string =>
  buildSecurityHeaders(opts).find((h) => h.key === "Content-Security-Policy")
    ?.value ?? "";

describe("security headers — production header set", () => {
  it("emits every required header exactly once and no Report-Only", () => {
    const counts = keyCounts(buildSecurityHeaders(prod));
    for (const key of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(counts.get(key), key).toBe(1);
    }
    expect(counts.has("Content-Security-Policy-Report-Only")).toBe(false);
  });

  it("sets HSTS (2y, no includeSubDomains/preload) and an enforced CSP", () => {
    const headers = buildSecurityHeaders(prod);
    const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toBe("max-age=63072000");
    expect(hsts?.value).not.toMatch(/includeSubDomains|preload/i);
    expect(cspOf(prod)).toContain("default-src 'self'");
  });

  it("fixes the static header values", () => {
    const headers = buildSecurityHeaders(prod);
    const value = (k: string) => headers.find((h) => h.key === k)?.value;
    expect(value("X-Content-Type-Options")).toBe("nosniff");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(value("Permissions-Policy")).toContain("geolocation=()");
    expect(value("Permissions-Policy")).toContain("camera=()");
  });
});

describe("security headers — non-production is intentional", () => {
  it("emits only the four always-safe headers (no CSP, no HSTS)", () => {
    const keys = buildSecurityHeaders(dev)
      .map((h) => h.key)
      .sort();
    expect(keys).toEqual([
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });
});

describe("security headers — CSP policy shape", () => {
  it("locks framing, plugins, base-uri, and form-action", () => {
    const csp = cspOf(prod);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("never allows unsafe-eval in production", () => {
    const csp = cspOf(prod);
    expect(directive("script-src", csp)).toBe("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("blocks inline HTML event-handler attributes via script-src-attr 'none'", () => {
    const csp = cspOf(prod);
    // Parse directives independently: split on ';' and match exact names, so
    // `script-src` never accidentally matches `script-src-attr`.
    const directives = csp.split(";").map((d) => d.trim());

    // script-src-attr exists exactly once with the exact value.
    expect(directives.filter((d) => d === "script-src-attr 'none'")).toHaveLength(1);
    expect(
      directives.filter((d) => d.split(/\s+/)[0] === "script-src-attr"),
    ).toHaveLength(1);
    expect(directive("script-src-attr", csp)).toBe("script-src-attr 'none'");

    // The base script-src keeps its Next.js-compatible value, unconfused with -attr.
    expect(directive("script-src", csp)).toBe("script-src 'self' 'unsafe-inline'");

    // No script-src-elem was added (no evidence it is needed), and no unsafe-eval.
    expect(directives.some((d) => d.split(/\s+/)[0] === "script-src-elem")).toBe(false);
    expect(csp).not.toContain("'unsafe-eval'");

    // Development still ships no CSP at all.
    expect(
      buildSecurityHeaders(dev).some((h) => h.key === "Content-Security-Policy"),
    ).toBe(false);
  });

  it("connect-src carries the derived Supabase https and wss origins", () => {
    expect(supabaseConnectOrigins(SAMPLE_URL)).toEqual([
      "https://abcdefgh.supabase.co",
      "wss://abcdefgh.supabase.co",
    ]);
    // A local http stack derives the ws:// (not wss://) scheme.
    expect(supabaseConnectOrigins("http://127.0.0.1:54321")).toEqual([
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
    ]);
    const connect = directive("connect-src", cspOf(prod));
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://abcdefgh.supabase.co");
    expect(connect).toContain("wss://abcdefgh.supabase.co");
  });

  it("has no wildcard origin, CORS-allow-all, X-XSS-Protection, or secret material", () => {
    const headers = buildSecurityHeaders(prod);
    const keys = headers.map((h) => h.key);
    expect(keys).not.toContain("Access-Control-Allow-Origin");
    expect(keys).not.toContain("X-XSS-Protection");

    const csp = cspOf(prod);
    expect(csp).not.toContain("*");

    for (const { value } of headers) {
      expect(value).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/); // JWT
      expect(value).not.toMatch(/sk_(live|test)_/);
      expect(value).not.toMatch(/service_role/i);
    }
  });
});

describe("security headers — Supabase URL handling never throws", () => {
  it("returns no origins for missing, blank, placeholder, or malformed values", () => {
    for (const bad of [
      undefined,
      "",
      "   ",
      "https://your-project.supabase.co", // .env.example placeholder
      "not a url",
      "ftp://example.org",
      "javascript:alert(1)",
    ]) {
      expect(() => supabaseConnectOrigins(bad)).not.toThrow();
      expect(supabaseConnectOrigins(bad), String(bad)).toEqual([]);
    }
  });

  it("falls back to connect-src 'self' when Supabase is unconfigured", () => {
    const csp = buildContentSecurityPolicy({
      isProduction: true,
      supabaseUrl: "https://your-project.supabase.co",
    });
    expect(directive("connect-src", csp)).toBe("connect-src 'self'");
  });
});

describe("security headers — next.config wiring is preserved", () => {
  it("applies one global /:path* rule that includes the CSP in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const { default: config } = await import("../next.config");
      expect(typeof config.headers).toBe("function");
      const rules = await config.headers!();
      expect(rules).toHaveLength(1);
      expect(rules[0].source).toBe("/:path*");
      const keys = rules[0].headers.map((h) => h.key);
      expect(keys).toContain("X-Frame-Options");
      expect(keys).toContain("Content-Security-Policy");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
