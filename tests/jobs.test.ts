import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobCard } from "@/components/JobCard";
import { formatPayRange } from "@/lib/types";
import {
  MOCK_JOBS,
  getMockJobs,
  getMockJobById,
  isJobPubliclyActive,
} from "@/lib/mock/jobs";

describe("formatPayRange", () => {
  it("formats an hourly range Korean-first with $ amounts", () => {
    expect(formatPayRange(18, 22, "hour")).toBe("시급 $18–$22");
  });

  it("collapses equal min/max to a single amount", () => {
    expect(formatPayRange(20, 20, "hour")).toBe("시급 $20");
  });

  it("adds thousands separators for salary ranges", () => {
    expect(formatPayRange(55000, 65000, "year")).toBe("연봉 $55,000–$65,000");
  });
});

describe("isJobPubliclyActive — expiry boundary (injected clock)", () => {
  // Fixed reference clock so cases never depend on the real date.
  const NOW = Date.parse("2026-07-15T00:00:00.000Z");
  const approved = { moderationStatus: "approved" } as const;

  it("is public when expiry is absent (null or undefined)", () => {
    expect(isJobPubliclyActive({ ...approved, expiresAt: null }, NOW)).toBe(true);
    expect(isJobPubliclyActive({ ...approved }, NOW)).toBe(true);
  });

  it("is public strictly when expiresAt > now", () => {
    expect(
      isJobPubliclyActive({ ...approved, expiresAt: "2099-01-01T00:00:00.000Z" }, NOW),
    ).toBe(true);
    expect(
      isJobPubliclyActive({ ...approved, expiresAt: new Date(NOW + 1000).toISOString() }, NOW),
    ).toBe(true);
  });

  it("is NOT public when expiresAt === now (strict cutoff)", () => {
    expect(
      isJobPubliclyActive({ ...approved, expiresAt: new Date(NOW).toISOString() }, NOW),
    ).toBe(false);
  });

  it("is NOT public when expiresAt < now", () => {
    expect(
      isJobPubliclyActive({ ...approved, expiresAt: "2020-01-01T00:00:00.000Z" }, NOW),
    ).toBe(false);
    expect(
      isJobPubliclyActive({ ...approved, expiresAt: new Date(NOW - 1000).toISOString() }, NOW),
    ).toBe(false);
  });

  it("fails closed on a malformed expiresAt string", () => {
    expect(isJobPubliclyActive({ ...approved, expiresAt: "not-a-real-date" }, NOW)).toBe(
      false,
    );
  });

  it("is never public when not approved, regardless of expiry", () => {
    expect(isJobPubliclyActive({ moderationStatus: "pending", expiresAt: null }, NOW)).toBe(
      false,
    );
    expect(
      isJobPubliclyActive(
        { moderationStatus: "expired", expiresAt: "2099-01-01T00:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("getMockJobs", () => {
  it("returns only approved jobs (excludes pending/draft)", () => {
    const jobs = getMockJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.moderationStatus === "approved")).toBe(true);
  });

  it("does not leak non-approved jobs that exist in the dataset", () => {
    const nonApproved = MOCK_JOBS.filter(
      (j) => j.moderationStatus !== "approved",
    );
    // The dataset must actually contain non-approved jobs, otherwise the filter
    // above is not really being exercised.
    expect(nonApproved.length).toBeGreaterThan(0);

    const publicIds = new Set(getMockJobs().map((j) => j.id));
    for (const job of nonApproved) {
      expect(publicIds.has(job.id)).toBe(false);
    }
  });

  it("getMockJobById never returns a non-approved job", () => {
    expect(getMockJobById("kw-101")).toBeUndefined(); // pending
    expect(getMockJobById("kw-102")).toBeUndefined(); // draft
    expect(getMockJobById("kw-001")?.moderationStatus).toBe("approved");
  });

  it("excludes approved-but-expired and malformed-expiry jobs from the list", () => {
    // The dataset must actually contain approved jobs whose expiry hides them,
    // otherwise this guard is not being exercised.
    const approvedButHidden = MOCK_JOBS.filter(
      (j) => j.moderationStatus === "approved" && !isJobPubliclyActive(j),
    );
    expect(approvedButHidden.map((j) => j.id).sort()).toEqual(["kw-011", "kw-012"]);

    const publicIds = new Set(getMockJobs().map((j) => j.id));
    expect(publicIds.has("kw-011")).toBe(false); // fixed past expiry
    expect(publicIds.has("kw-012")).toBe(false); // malformed expiry (fail closed)
  });

  it("keeps approved jobs with null or future expiry public", () => {
    const publicIds = new Set(getMockJobs().map((j) => j.id));
    expect(publicIds.has("kw-001")).toBe(true); // no expiresAt (null)
    expect(publicIds.has("kw-010")).toBe(true); // far-future expiresAt
  });

  it("getMockJobById returns undefined for expired / malformed-expiry jobs", () => {
    expect(getMockJobById("kw-011")).toBeUndefined(); // expired
    expect(getMockJobById("kw-012")).toBeUndefined(); // malformed expiry
    expect(getMockJobById("kw-010")?.id).toBe("kw-010"); // future expiry still resolves
  });
});

describe("application job detail", () => {
  it("links approved job details to the Slice 5 application route", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "(public)", "jobs", "[id]", "page.tsx"),
      "utf8",
    );
    expect(source).toContain(
      "href={`/jobs/${encodeURIComponent(job.id)}/apply`}",
    );
    expect(source).toContain(
      "href={`/jobs/${encodeURIComponent(job.id)}/report`}",
    );
    expect(source).toContain("provided by the employer");
    expect(source).toContain("not guarantee job quality");
    expect(source).not.toContain('aria-disabled="true"');
  });

  it("shows a modest company-reviewed badge only for verified public job cards", () => {
    const verified = { ...getMockJobs()[0], employerVerified: true };
    const unverified = { ...getMockJobs()[0], employerVerified: false };

    expect(renderToStaticMarkup(createElement(JobCard, { job: verified }))).toContain(
      "Company info reviewed",
    );
    expect(renderToStaticMarkup(createElement(JobCard, { job: unverified }))).not.toContain(
      "Company info reviewed",
    );
  });

  it("keeps report and verification copy informational", () => {
    const reportPage = readFileSync(
      join(process.cwd(), "src", "app", "(public)", "jobs", "[id]", "report", "page.tsx"),
      "utf8",
    );
    const badgeSource = readFileSync(
      join(process.cwd(), "src", "components", "Badge.tsx"),
      "utf8",
    );
    expect(reportPage).toContain("A report is not a legal determination");
    expect(badgeSource).toContain("Company info reviewed");
    expect(badgeSource).not.toContain("Trusted");
    expect(badgeSource).not.toContain("Guaranteed");
  });
});
