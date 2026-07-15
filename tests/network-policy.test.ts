import { describe, it, expect } from "vitest";
import { isAllowedE2EUrl } from "./e2e/network-policy";

/**
 * Pins the E2E external-network policy (tests/e2e/network-policy.ts): only the
 * EXACT configured origin (and its matching dev/HMR WebSocket) is allowed —
 * every other port, loopback host, external host, or malformed URL fails
 * closed. Pure string classification; these tests make no network requests.
 */
const BASE = "http://localhost:3130";

describe("isAllowedE2EUrl", () => {
  it("allows the exact base origin", () => {
    expect(isAllowedE2EUrl("http://localhost:3130/", BASE)).toBe(true);
    expect(isAllowedE2EUrl("http://localhost:3130", BASE)).toBe(true);
  });

  it("allows the same origin with a path and query", () => {
    expect(
      isAllowedE2EUrl("http://localhost:3130/jobs?q=x&city=Irvine", BASE),
    ).toBe(true);
  });

  it("allows the matching local dev/HMR WebSocket", () => {
    expect(
      isAllowedE2EUrl("ws://localhost:3130/_next/webpack-hmr", BASE),
    ).toBe(true);
  });

  it("rejects localhost on a different port (e.g. a local Supabase)", () => {
    expect(isAllowedE2EUrl("http://localhost:54321/rest/v1/jobs", BASE)).toBe(
      false,
    );
    expect(isAllowedE2EUrl("ws://localhost:54321/socket", BASE)).toBe(false);
  });

  it("rejects 127.0.0.1 / IPv6 loopback when baseURL uses localhost", () => {
    expect(isAllowedE2EUrl("http://127.0.0.1:3130/", BASE)).toBe(false);
    expect(isAllowedE2EUrl("http://[::1]:3130/", BASE)).toBe(false);
    expect(
      isAllowedE2EUrl("ws://127.0.0.1:3130/_next/webpack-hmr", BASE),
    ).toBe(false);
  });

  it("rejects external HTTPS and WebSocket hosts", () => {
    expect(isAllowedE2EUrl("https://example.com/x", BASE)).toBe(false);
    expect(
      isAllowedE2EUrl("https://your-project.supabase.co/auth/v1/token", BASE),
    ).toBe(false);
    expect(isAllowedE2EUrl("wss://example.com/socket", BASE)).toBe(false);
  });

  it("rejects malformed / unparseable / unsupported URLs (fails closed)", () => {
    for (const bad of ["not a url", "http://", "://nope", "localhost:3130", ""]) {
      expect(isAllowedE2EUrl(bad, BASE)).toBe(false);
    }
    expect(isAllowedE2EUrl(undefined as unknown as string, BASE)).toBe(false);
  });

  it("allows inert, non-network browser URLs", () => {
    expect(isAllowedE2EUrl("about:blank", BASE)).toBe(true);
    expect(isAllowedE2EUrl("data:text/html,<p>x</p>", BASE)).toBe(true);
    expect(isAllowedE2EUrl("blob:http://localhost:3130/abc-123", BASE)).toBe(
      true,
    );
  });

  it("honors an https baseURL (wss allowed, ws rejected)", () => {
    const httpsBase = "https://localhost:3130";
    expect(isAllowedE2EUrl("https://localhost:3130/x", httpsBase)).toBe(true);
    expect(isAllowedE2EUrl("wss://localhost:3130/hmr", httpsBase)).toBe(true);
    expect(isAllowedE2EUrl("ws://localhost:3130/hmr", httpsBase)).toBe(false);
    expect(isAllowedE2EUrl("http://localhost:3130/x", httpsBase)).toBe(false);
  });
});
