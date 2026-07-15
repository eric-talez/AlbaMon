import { defineConfig, devices } from "@playwright/test";

/**
 * Slice 30 — hermetic core browser E2E (Chromium only).
 *
 * The dev server runs in DEV-AUTH MODE: placeholder Supabase env makes
 * `isSupabaseConfigured()` false, which (a) enables the unsigned cookie
 * role-picker (`isDevAuthEnabled()`), and (b) serves deterministic mock jobs
 * (`kw-001`..`kw-010`) instead of hitting a database. Both require a
 * non-production runtime, so the server is `next dev` (never `next start`).
 *
 * No credentials, Docker, hosted Supabase, network services, or persistent
 * writes are involved. The placeholder values below are intentionally
 * non-secret (they match `.env.example`) so `tests/security.test.ts`'s
 * secret-shape scan stays green.
 */

const PORT = 3130;
const BASE_URL = `http://localhost:${PORT}`;

const DEV_AUTH_ENV = {
  // Placeholder fragments → treated as unconfigured → dev-auth + mock jobs.
  NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
  // Fixed site URL so /api/health reports siteUrl "configured" deterministically.
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // No `.only` slips into CI; retries only in CI; a fixed, deterministic worker
  // count so runs are reproducible rather than scaling with the host's cores.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  // Dev-mode (Turbopack) first-request compiles can be slow — be generous.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Artifacts on failure only (kept out of git via .gitignore).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // 390px mobile viewport — only the viewport-relevant specs run here.
      name: "chromium-mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      testMatch: /(public-shell|job-discovery|responsive-nav)\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: DEV_AUTH_ENV,
  },
});
