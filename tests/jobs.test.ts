import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatPayRange } from "@/lib/types";
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
    expect(source).not.toContain('aria-disabled="true"');
  });
});
