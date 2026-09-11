import { afterEach, expect, test, vi } from "vitest";
import { checkDeployTarget } from "../scripts/check-deploy-target.mjs";
import robots from "@/app/robots";
import nextConfig from "../next.config";
const mapping = {
  NODE_ENV: "test" as const,
  STAGING_PROJECT_REF: "abcdefghijklmnopqrst", PRODUCTION_PROJECT_REF: "uvwxyzabcdefghijklmn",
  STAGING_ORIGIN: "https://staging.k-work.test", PRODUCTION_ORIGIN: "https://jobs.k-work.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SITE_URL: "https://staging.k-work.test/",
  EMAIL_ENVIRONMENT: "staging", NEXT_PUBLIC_INDEXING_ENABLED: "false",
};
afterEach(() => vi.unstubAllEnvs());
test("isolated staging normalizes optional root slash", () => {
  expect(checkDeployTarget("staging", mapping)).toEqual({target:"staging",origin:"https://staging.k-work.test",projectRef:"abcdefghijklmnopqrst"});
});
test.each([
  {PRODUCTION_PROJECT_REF:mapping.STAGING_PROJECT_REF}, {PRODUCTION_ORIGIN:mapping.STAGING_ORIGIN},
  {NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55321"}, {NEXT_PUBLIC_SUPABASE_URL:"https://wrong.supabase.co"},
  {EMAIL_ENVIRONMENT:"production"}, {NEXT_PUBLIC_INDEXING_ENABLED:"true"}, {STAGING_PROJECT_REF:""},
  {NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test/a"}, {NEXT_PUBLIC_SITE_URL:"https://u:p@staging.k-work.test"},
  {NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test?"}, {NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test#"},
  {NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test/a/.."}, {NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test/%2e"},
  {NEXT_PUBLIC_SITE_URL:"https://127.0.0.1"}, {NEXT_PUBLIC_SITE_URL:"https://jobs.localhost"},
])("rejects mismapped or malformed target %j", patch => {
  expect(() => checkDeployTarget("staging", {...mapping,...patch})).toThrow();
});
test("recovery identity must differ from both hosted environments", () => {
  const recovery={...mapping,RECOVERY_PROJECT_REF:"aabbccddeeffgghhiijj",RECOVERY_ORIGIN:"https://recovery.k-work.test",NEXT_PUBLIC_SITE_URL:"https://recovery.k-work.test",NEXT_PUBLIC_SUPABASE_URL:"https://aabbccddeeffgghhiijj.supabase.co"};
  expect(checkDeployTarget("recovery",recovery)?.target).toBe("recovery");
  expect(() => checkDeployTarget("recovery",{...recovery,RECOVERY_PROJECT_REF:mapping.PRODUCTION_PROJECT_REF})).toThrow();
  expect(() => checkDeployTarget("local",mapping)).toThrow();
});
test("staging suppresses crawl discovery and all response indexing", async () => {
  vi.stubEnv("NEXT_PUBLIC_INDEXING_ENABLED","false");
  expect(robots()).toEqual({rules:{userAgent:"*",disallow:"/"}});
  expect(await nextConfig.headers!()).toContainEqual({source:"/:path*",headers:[{key:"X-Robots-Tag",value:"noindex, nofollow"}]});
});
test("production retains public robots and emits no blanket noindex", async () => {
  vi.stubEnv("NEXT_PUBLIC_INDEXING_ENABLED","true");
  expect(robots().sitemap).toBeTruthy();
  expect(await nextConfig.headers!()).toEqual([]);
});

test("Vercel Production rejects a coherently copied Preview environment", () => {
  const copiedPreview = { ...mapping, VERCEL_ENV: "production" };
  expect(() => checkDeployTarget(copiedPreview.EMAIL_ENVIRONMENT, copiedPreview)).toThrow("Vercel Production must use production");
});

test("the selected Vercel project maps Preview to staging and Production to production", () => {
  expect(checkDeployTarget("staging", { ...mapping, VERCEL_ENV: "preview" })?.target).toBe("staging");
  const production = { ...mapping, EMAIL_ENVIRONMENT: "production", NEXT_PUBLIC_INDEXING_ENABLED: "true",
    NEXT_PUBLIC_SITE_URL: mapping.PRODUCTION_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: "https://uvwxyzabcdefghijklmn.supabase.co" };
  expect(checkDeployTarget("production", { ...production, VERCEL_ENV: "production" })?.target).toBe("production");
  expect(() => checkDeployTarget("production", { ...production, VERCEL_ENV: "preview" })).toThrow("Vercel Preview must use staging");
});
