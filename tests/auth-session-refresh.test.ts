import { afterEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";
import { updateSession } from "@/lib/supabase/proxy";
import { canUseAdmin } from "@/lib/auth/access";

const mocks = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/supabase/config", () => ({
  SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_ANON_KEY: "test-key",
  isSupabaseConfigured: () => mocks.configured,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[], headers: Record<string, string>) => void } }) => ({
    auth: { getUser: async () => {
      options.cookies.setAll([{ name: "session", value: "refreshed", options: { path: "/", httpOnly: true } }], {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
        Expires: "0", Pragma: "no-cache",
      });
    } },
  }),
}));
afterEach(() => { mocks.configured = true; });

test("an admin role alone does not grant privileged access", () => {
  expect(canUseAdmin({ role: "admin", aal: "aal1" })).toBe(false);
  expect(canUseAdmin({ role: "admin", aal: "aal2" })).toBe(true);
  expect(canUseAdmin({ role: "seeker", aal: "aal2" })).toBe(false);
});
test("refresh forwards the new cookie to this request and response with cache prevention", async () => {
  const request = new NextRequest("http://localhost/dashboard", { headers: { cookie: "session=expired" } });
  const response = await updateSession(request);
  expect(request.cookies.get("session")?.value).toBe("refreshed");
  expect(response.headers.get("x-middleware-request-cookie")).toBe("session=refreshed");
  expect(response.cookies.get("session")).toMatchObject({ value: "refreshed", httpOnly: true });
  expect(response.headers.get("cache-control")).toContain("private, no-cache, no-store");
  expect(response.headers.get("expires")).toBe("0");
  expect(response.headers.get("pragma")).toBe("no-cache");
});
test("unconfigured refresh passes through without changing cookies", async () => {
  mocks.configured = false;
  const response = await updateSession(new NextRequest("http://localhost/dashboard"));
  expect(response.cookies.getAll()).toEqual([]);
});
test("health and readiness bypass auth proxy; protected pages do not", () => {
  for (const url of ["/api/health", "/api/ready", "/api/internal/worker"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  }
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/admin" })).toBe(true);
});
