import { defineConfig, devices } from "@playwright/test";

// These tests require the seeded disposable stack, never a hosted project.
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321" ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("E2E requires the isolated local Supabase URL and anon key; see docs/launch-evidence/rls-matrix.md");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/ready",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
