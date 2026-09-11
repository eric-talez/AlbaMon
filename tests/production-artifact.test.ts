import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const releaseEnv = {
  NEXT_PUBLIC_SITE_URL: "https://jobs.k-work.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_release_test_key",
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
  SUPABASE_SERVICE_ROLE_KEY: "service-release-test",
  EMAIL_PROVIDER: "resend", EMAIL_NOTIFICATIONS_ENABLED: "true", EMAIL_ENVIRONMENT: "production",
  EMAIL_FROM: "K-Work US <sender@k-work.test>", RESEND_API_KEY: "re_release_test", RESEND_WEBHOOK_SECRET: "whsec_release_test", CRON_SECRET: "cron-release-test-with-length",
};

const maxDnsLabel = "a".repeat(63);
const maxDnsHostname = [
  "a".repeat(63),
  "b".repeat(63),
  "c".repeat(63),
  "d".repeat(61),
].join(".");

function checkReleaseEnv(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", 'import { checkReleaseEnv } from "./scripts/check-release-env.mjs"; import { syntheticPublication } from "./tests/fixtures/policy-publication.mjs"; import { policyAcceptanceIdentity } from "./src/lib/policy-publication.mjs"; checkReleaseEnv(process.env, syntheticPublication(), policyAcceptanceIdentity(syntheticPublication()));'], {
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
    ["SUPABASE_SERVICE_ROLE_KEY", "your-service-role-key"],
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
    ["repeated terminal dot", "https://localhost.."],
    ["empty middle label", "https://foo..com"],
    ["leading empty label", "https://.foo.com"],
    ["underscore in label", "https://foo_bar.com"],
    ["leading label hyphen", "https://-foo.com"],
    ["trailing label hyphen", "https://foo-.com"],
    ["64-character label", `https://${"a".repeat(64)}.com`],
    [
      "overlong hostname",
      `https://${["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(62)].join(".")}`,
    ],
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

  it.each([
    ["ordinary hostname", "https://jobs.k-work.us"],
    ["punycode hostname", "https://xn--bcher-kva.de"],
    ["one terminal root dot", "https://jobs.k-work.us."],
    ["63-character label", `https://${maxDnsLabel}.com`],
    ["253-character hostname", `https://${maxDnsHostname}`],
  ])("accepts a public HTTPS DNS hostname: %s", (_case, siteUrl) => {
    const result = checkReleaseEnv({ NEXT_PUBLIC_SITE_URL: siteUrl });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

it("release rejects disabled delivery and staging without controlled recipient allowlist", () => {
  expect(checkReleaseEnv({ EMAIL_NOTIFICATIONS_ENABLED: "false" }).status).not.toBe(0);
  expect(checkReleaseEnv({ EMAIL_ENVIRONMENT: "staging", EMAIL_STAGING_ALLOWLIST: "" }).status).not.toBe(0);
  expect(checkReleaseEnv({ EMAIL_ENVIRONMENT: "staging", EMAIL_STAGING_ALLOWLIST: "*@example.invalid" }).status).not.toBe(0);
  expect(checkReleaseEnv({ EMAIL_ENVIRONMENT: "staging", EMAIL_STAGING_ALLOWLIST: "controlled@example.invalid" }).status).toBe(0);
});
it.each(["https://jobs.k-work.test/path", "https://user:pass@jobs.k-work.test", "https://jobs.k-work.test?x=1"])("release origin %s cannot produce a mismatched email link", (origin) => {
  expect(checkReleaseEnv({ NEXT_PUBLIC_SITE_URL: origin }).status).not.toBe(0);
});

it.each(["development", "test", ""])("standalone release config preflight works before Next sets production runtime: %s", (runtime) => {
  expect(checkReleaseEnv({ NODE_ENV: runtime }).status).toBe(0);
});

// The real CLI cannot use a synthetic approval; absent target mapping still blocks a reviewed checkout.
it("actual release CLI cannot pass from synthetic infrastructure alone", () => {
  const result = spawnSync(process.execPath, ["scripts/check-release-env.mjs"], { encoding: "utf8", env: { ...process.env, ...releaseEnv, STAGING_PROJECT_REF: "" } });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Policy publication blocked:|Missing or invalid staging project ref/);
});

it("pure release validator rejects absent or mismatched database identity", async () => {
  const { checkReleaseEnv: validate } = await import("../scripts/check-release-env.mjs");
  const { syntheticPublication } = await import("./fixtures/policy-publication.mjs");
  for (const identity of [undefined, `draft:${"a".repeat(64)}`, `reviewed:${"b".repeat(64)}`]) {
    expect(() => validate({...releaseEnv,NODE_ENV:"test"}, syntheticPublication(), identity)).toThrow("database identity mismatch");
  }
});

it("database identity read uses only the anonymous key and fixed errors", async () => {
  const { createServer } = await import("node:http");
  const { readDatabasePolicyIdentity } = await import("../scripts/check-release-env.mjs");
  const identity=`draft:${"c".repeat(64)}`;
  let malformed=false;
  const server=createServer((request,response)=>{
    expect(request.url).toBe("/rest/v1/rpc/current_policy_identity");
    expect(request.method).toBe("POST");
    expect(request.headers.apikey).toBe("anonymous-test-key");
    expect(request.headers.authorization).toBe("Bearer anonymous-test-key");
    response.setHeader("Content-Type","application/json");
    response.end(JSON.stringify(malformed?{private:"must-not-escape"}:identity));
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const address=server.address();if(!address||typeof address==="string") throw Error("Test server unavailable");
    const env={NODE_ENV:"test" as const,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${address.port}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:"anonymous-test-key",SUPABASE_SERVICE_ROLE_KEY:"must-not-send"};
    expect(await readDatabasePolicyIdentity(env)).toBe(identity);
    malformed=true;
    await expect(readDatabasePolicyIdentity(env)).rejects.toThrow(/^Policy publication blocked: database identity unavailable$/);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
