import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getReadiness } from "@/app/api/ready/route";
import { config as proxyConfig } from "@/proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_readiness_test_key";

function configureSupabase(): void {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/ready", () => {
  it("returns 200 for an empty successful public listing read", async () => {
    configureSupabase();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([], {
          status: 200,
          headers: { "Content-Range": "*/0" },
        }),
      ),
    );

    const response = await getReadiness();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 when Supabase settings are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await getReadiness();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("returns 503 for a rejected anon-key database read", async () => {
    configureSupabase();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "invalid API key" },
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const response = await getReadiness();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("aborts an unavailable database read after two seconds", async () => {
    configureSupabase();
    const startedAt = Date.now();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = input instanceof Request ? input.signal : init?.signal;
            if (signal?.aborted) {
              reject(signal.reason);
              return;
            }
            signal?.addEventListener("abort", () => reject(signal.reason));
          }),
      ),
    );

    const response = await getReadiness();

    expect(response.status).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_900);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
  });

  it("keeps liveness at 200 while readiness reports a DB outage", async () => {
    configureSupabase();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));

    expect((await getReadiness()).status).toBe(503);
    expect((await getHealth()).status).toBe(200);
  });
});

describe("proxy exclusions", () => {
  it.each(["/api/health", "/api/ready", "/api/internal/notifications"])(
    "does not refresh a session for %s",
    (url) => {
      expect(
        unstable_doesMiddlewareMatch({
          config: proxyConfig,
          nextConfig: {},
          url,
        }),
      ).toBe(false);
    },
  );

  it("continues refreshing sessions for application routes", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        nextConfig: {},
        url: "/jobs",
      }),
    ).toBe(true);
  });
});
