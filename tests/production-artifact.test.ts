import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const releaseEnv = {
  NEXT_PUBLIC_SITE_URL: "https://jobs.k-work.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_release_test_key",
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
};

function checkReleaseEnv(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/check-release-env.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...releaseEnv, ...overrides },
  });
}

describe("release environment gate", () => {
  it.each(Object.keys(releaseEnv))(
    "rejects a missing required release setting: %s",
    (name) => {
      const result = checkReleaseEnv({ [name]: "" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Missing release setting: ${name}`);
    },
  );

  it.each([
    ["NEXT_PUBLIC_SITE_URL", "https://example.com"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key"],
  ])("rejects a placeholder release setting: %s", (name, value) => {
    const result = checkReleaseEnv({ [name]: value });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Missing release setting: ${name}`);
  });

  it.each([
    ["HTTP localhost", "http://localhost:3000"],
    ["IPv6 loopback", "https://[::1]"],
    ["private IPv4", "https://10.0.0.1"],
    ["other IPv4 literal", "https://203.0.113.10"],
    ["other IPv6 literal", "https://[2001:db8::1]"],
    ["localhost trailing dot", "https://localhost."],
    ["localhost subdomain", "https://jobs.localhost"],
    ["localhost subdomain trailing dot", "https://jobs.localhost."],
    ["single-label hostname", "https://intranet"],
  ])("rejects a non-public site origin: %s", (_case, siteUrl) => {
    const result = checkReleaseEnv({ NEXT_PUBLIC_SITE_URL: siteUrl });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release requires a public HTTPS origin");
  });

  it("requires Google authentication to have passed its smoke test", () => {
    const result = checkReleaseEnv({
      NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "false",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Release requires tested Google authentication",
    );
  });

  it("accepts a public HTTPS DNS hostname", () => {
    const result = checkReleaseEnv({
      NEXT_PUBLIC_SITE_URL: "https://jobs.k-work.us",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
