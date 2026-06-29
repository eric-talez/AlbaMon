import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JobCard } from "@/components/JobCard";
import { BOOST_LABELS, formatPayRange } from "@/lib/types";
import { MOCK_JOBS, getMockJobs, getMockJobById } from "@/lib/mock/jobs";

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
    expect(source).toContain("Boosts do not imply job quality");
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

  it("shows boost badges only for boosted approved public job cards", () => {
    const boosted = { ...getMockJobs()[0], boost: "featured" as const };
    const unboosted = { ...getMockJobs()[0], boost: null };

    expect(renderToStaticMarkup(createElement(JobCard, { job: boosted }))).toContain(
      BOOST_LABELS.featured,
    );
    expect(renderToStaticMarkup(createElement(JobCard, { job: unboosted }))).not.toContain(
      BOOST_LABELS.featured,
    );
    expect(getMockJobById("kw-101")).toBeUndefined();
    expect(getMockJobById("kw-102")).toBeUndefined();
  });

  it("keeps report, boost, and verification copy informational", () => {
    const reportPage = readFileSync(
      join(process.cwd(), "src", "app", "(public)", "jobs", "[id]", "report", "page.tsx"),
      "utf8",
    );
    const boostPage = readFileSync(
      join(process.cwd(), "src", "app", "employer", "jobs", "[id]", "boost", "page.tsx"),
      "utf8",
    );
    const badgeSource = readFileSync(
      join(process.cwd(), "src", "components", "Badge.tsx"),
      "utf8",
    );
    expect(reportPage).toContain("A report is not a legal determination");
    expect(boostPage).toContain("do not guarantee applicants, hires, job");
    expect(boostPage).toContain("legal compliance, or endorsement");
    expect(badgeSource).toContain("Company info reviewed");
    expect(badgeSource).not.toContain("Trusted");
    expect(badgeSource).not.toContain("Guaranteed");
  });
});
