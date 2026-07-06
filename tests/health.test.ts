import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHealthReport } from "@/lib/ops/health";
import { GET } from "@/app/api/health/route";

/** Every env var the health report reads. Tests stub all of them explicitly
 * so ambient shell/CI values can never change an outcome. */
const HEALTH_ENV_VARS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_FEATURED_PRICE_ID",
  "STRIPE_URGENT_PRICE_ID",
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "SENDGRID_API_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
] as const;

/** Realistic-but-fake values. Deliberately short tails so the repo-wide
 * secret-pattern scan (tests/security.test.ts) never mistakes them for real
 * credentials, and free of the placeholder fragments the app treats as
 * unconfigured (`your-`, `xxx`, `example`, `placeholder`). */
const CONFIGURED_ENV: Record<(typeof HEALTH_ENV_VARS)[number], string> = {
  NEXT_PUBLIC_SITE_URL: "https://beta-health.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://kwus-health.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-for-health-tests",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-for-health-tests",
  STRIPE_SECRET_KEY: "sk_test_health",
  STRIPE_WEBHOOK_SECRET: "whsec_health",
  STRIPE_FEATURED_PRICE_ID: "price_featured_health",
  STRIPE_URGENT_PRICE_ID: "price_urgent_health",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_health",
  SENDGRID_API_KEY: "",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_health",
};

function stubAllUnset(): void {
  for (const name of HEALTH_ENV_VARS) vi.stubEnv(name, "");
}

function stubAllConfigured(): void {
  for (const name of HEALTH_ENV_VARS) vi.stubEnv(name, CONFIGURED_ENV[name]);
}

afterEach(() => vi.unstubAllEnvs());

describe("buildHealthReport envelope", () => {
  it("always reports ok / k-work-us with an ISO timestamp", () => {
    stubAllUnset();
    const fixed = new Date("2026-07-06T12:00:00.000Z");
    expect(buildHealthReport(fixed)).toMatchObject({
      status: "ok",
      service: "k-work-us",
      timestamp: "2026-07-06T12:00:00.000Z",
    });
    expect(Number.isNaN(Date.parse(buildHealthReport().timestamp))).toBe(false);
  });

  it("stays ok in a fully unconfigured process (CI mode) and reports missing/deferred", () => {
    stubAllUnset();
    const report = buildHealthReport();
    expect(report.status).toBe("ok");
    expect(report.checks).toEqual({
      siteUrl: "missing",
      supabase: "missing",
      stripe: "missing",
      email: "deferred",
      analytics: "deferred",
    });
  });

  it("reports everything configured when all required values are real", () => {
    stubAllConfigured();
    expect(buildHealthReport().checks).toEqual({
      siteUrl: "configured",
      supabase: "configured",
      stripe: "configured",
      email: "configured",
      analytics: "configured",
    });
  });

  it("treats .env.example placeholder values as unconfigured", () => {
    stubAllUnset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_xxx");
    const { checks } = buildHealthReport();
    expect(checks.supabase).toBe("missing");
    expect(checks.stripe).toBe("missing");
  });
});

describe("siteUrl check", () => {
  it("requires a parseable URL", () => {
    stubAllUnset();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(buildHealthReport().checks.siteUrl).toBe("missing");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beta-health.test");
    expect(buildHealthReport().checks.siteUrl).toBe("configured");
  });
});

describe("supabase check", () => {
  it("is partial when auth credentials exist but the service-role key is absent", () => {
    stubAllConfigured();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(buildHealthReport().checks.supabase).toBe("partial");
  });

  it("is partial when only the service-role key exists", () => {
    stubAllUnset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://kwus-health.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-for-health-tests");
    expect(buildHealthReport().checks.supabase).toBe("partial");
  });
});

describe("stripe check", () => {
  it("is partial until the secret key, webhook secret, and both price ids exist", () => {
    stubAllUnset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_health");
    expect(buildHealthReport().checks.stripe).toBe("partial");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_health");
    vi.stubEnv("STRIPE_FEATURED_PRICE_ID", "price_featured_health");
    expect(buildHealthReport().checks.stripe).toBe("partial");
    vi.stubEnv("STRIPE_URGENT_PRICE_ID", "price_urgent_health");
    expect(buildHealthReport().checks.stripe).toBe("configured");
  });
});

describe("email check", () => {
  it("is deferred for the dev stub or when unset", () => {
    stubAllUnset();
    expect(buildHealthReport().checks.email).toBe("deferred");
    vi.stubEnv("EMAIL_PROVIDER", "dev");
    expect(buildHealthReport().checks.email).toBe("deferred");
  });

  it("flags a real provider without its API key as partial", () => {
    stubAllUnset();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    expect(buildHealthReport().checks.email).toBe("partial");
    vi.stubEnv("RESEND_API_KEY", "re_health");
    expect(buildHealthReport().checks.email).toBe("configured");
  });

  it("supports sendgrid with its own key", () => {
    stubAllUnset();
    vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
    expect(buildHealthReport().checks.email).toBe("partial");
    vi.stubEnv("SENDGRID_API_KEY", "sg_health");
    expect(buildHealthReport().checks.email).toBe("configured");
  });
});

describe("analytics check", () => {
  it("is deferred without a PostHog key and configured with one", () => {
    stubAllUnset();
    expect(buildHealthReport().checks.analytics).toBe("deferred");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_health");
    expect(buildHealthReport().checks.analytics).toBe("configured");
  });
});

describe("public-safety contract", () => {
  it("never includes any env value in the serialized report", () => {
    stubAllConfigured();
    const serialized = JSON.stringify(buildHealthReport());
    for (const name of HEALTH_ENV_VARS) {
      const value = CONFIGURED_ENV[name];
      if (!value) continue;
      expect(serialized).not.toContain(value);
    }
  });

  it("only ever emits the four known statuses", () => {
    stubAllConfigured();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("EMAIL_PROVIDER", "dev");
    const { checks } = buildHealthReport();
    for (const status of Object.values(checks)) {
      expect(["configured", "partial", "missing", "deferred"]).toContain(status);
    }
  });
});

describe("GET /api/health", () => {
  it("answers 200 JSON with no-store caching even when fully unconfigured", async () => {
    stubAllUnset();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      service: "k-work-us",
      checks: {
        siteUrl: "missing",
        supabase: "missing",
        stripe: "missing",
        email: "deferred",
        analytics: "deferred",
      },
    });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
