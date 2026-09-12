import { test, expect } from "./helpers";

/**
 * Scenario 5 — operational surface. `/api/health` is a public, credential-free
 * liveness probe: HTTP 200 with the coarse presence-only checks (including the
 * Slice 29 `rateLimit` signal) and never any env value or secret-shaped content.
 * (Runs on the desktop project only — it is a viewport-agnostic API check.)
 */
test("GET /api/health returns 200 with coarse checks incl. rateLimit, no secrets", async ({
  page,
}) => {
  const response = await page.request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["cache-control"]).toBe("no-store");

  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", service: "k-work-us" });

  // All five coarse checks are present, including rateLimit.
  expect(Object.keys(body.checks).sort()).toEqual([
    "analytics",
    "email",
    "rateLimit",
    "siteUrl",
    "supabase",
  ]);
  // Only the known coarse statuses ever appear.
  for (const status of Object.values(body.checks)) {
    expect(["configured", "partial", "missing", "deferred"]).toContain(status);
  }

  // No env value or secret-shaped content leaks into the response body.
  const raw = JSON.stringify(body);
  expect(raw).not.toContain("your-anon-key");
  expect(raw).not.toContain("your-project");
  expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./);
});
