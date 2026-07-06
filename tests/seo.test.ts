import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as rootMetadata } from "@/app/layout";
import { metadata as jobsMetadata } from "@/app/(public)/jobs/page";
import { metadata as applyMetadata } from "@/app/(public)/jobs/[id]/apply/page";
import { metadata as reportMetadata } from "@/app/(public)/jobs/[id]/report/page";
import { metadata as termsMetadata } from "@/app/(public)/terms/page";
import { metadata as privacyMetadata } from "@/app/(public)/privacy/page";
import { metadata as postingPolicyMetadata } from "@/app/(public)/posting-policy/page";
import { metadata as workAuthMetadata } from "@/app/(public)/work-authorization-info/page";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("allows public pages and disallows account, auth, and API areas", () => {
    const result = robots();
    const rules = result.rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    for (const path of [
      "/admin",
      "/api",
      "/auth",
      "/dashboard",
      "/employer",
      "/forbidden",
      "/login",
      "/signup",
    ]) {
      expect(rules.disallow).toContain(path);
    }
    expect(result.sitemap).toBe(`${getSiteUrl()}/sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  it("lists exactly the static public pages as absolute URLs", () => {
    const base = getSiteUrl();
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      `${base}/`,
      `${base}/jobs`,
      `${base}/work-authorization-info`,
      `${base}/posting-policy`,
      `${base}/terms`,
      `${base}/privacy`,
    ]);
  });

  it("contains no per-job URLs (build-time sitemap must not go stale or leak)", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => /\/jobs\/.+/.test(url))).toBe(false);
  });

  it("uses NEXT_PUBLIC_SITE_URL when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beta.example.org/");
    expect(robots().sitemap).toBe("https://beta.example.org/sitemap.xml");
    expect(sitemap()[0].url).toBe("https://beta.example.org/");
  });
});

describe("page metadata", () => {
  it("root layout sets metadataBase, a title template, and Open Graph identity", () => {
    expect(rootMetadata.metadataBase).toBeInstanceOf(URL);
    const title = rootMetadata.title as { default: string; template: string };
    expect(title.template).toBe(`%s | ${SITE_NAME}`);
    expect(title.default).toContain(SITE_NAME);
    expect(rootMetadata.openGraph?.siteName).toBe(SITE_NAME);
    expect(rootMetadata.openGraph?.locale).toBe("ko_KR");
  });

  it("jobs listing declares one canonical URL for all filter variants", () => {
    expect(jobsMetadata.alternates?.canonical).toBe("/jobs");
  });

  it("apply and report user flows are excluded from indexing", () => {
    expect(applyMetadata.robots).toMatchObject({ index: false });
    expect(reportMetadata.robots).toMatchObject({ index: false });
  });

  it("policy pages ship informational descriptions without guarantees", () => {
    const metas = [
      termsMetadata,
      privacyMetadata,
      postingPolicyMetadata,
      workAuthMetadata,
    ];
    for (const meta of metas) {
      expect(typeof meta.description).toBe("string");
      expect((meta.description as string).length).toBeGreaterThan(10);
      expect((meta.description as string).toLowerCase()).not.toContain("guarantee");
      expect(meta.description as string).not.toContain("보장");
    }
    // Work-authorization info must stay information-only, not legal advice.
    expect(workAuthMetadata.description).toContain("법률 자문을 제공하지 않습니다");
    expect(workAuthMetadata.description).toContain("판단하지 않");
  });
});
