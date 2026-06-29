import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_REASONS, REPORT_STATUSES } from "@/lib/types";

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}

const sql = read("supabase/migrations/20260628000000_report_queue_hardening.sql");

describe("report queue migration", () => {
  it("constrains report reasons to the TypeScript reason set", () => {
    const check = sql.match(
      /constraint\s+reports_reason_allowed[\s\S]*?reason\s+in\s*\(([^)]*)\)/i,
    );
    expect(check).toBeTruthy();
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...REPORT_REASONS]);
  });

  it("constrains report statuses and detail length", () => {
    const check = sql.match(
      /constraint\s+reports_status_allowed[\s\S]*?status\s+in\s*\(([^)]*)\)/i,
    );
    expect(check).toBeTruthy();
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...REPORT_STATUSES]);
    expect(sql).toMatch(/constraint\s+reports_details_max_length[\s\S]*?char_length\(details\)\s*<=\s*1000/i);
  });

  it("prevents duplicate same-user same-job same-reason reports", () => {
    expect(sql).toMatch(
      /create\s+unique\s+index\s+reports_unique_reporter_job_reason[\s\S]*?\(reporter_id,\s*job_id,\s*reason\)/i,
    );
    expect(sql).toMatch(/where\s+reporter_id\s+is\s+not\s+null\s+and\s+job_id\s+is\s+not\s+null/i);
  });

  it("limits report inserts to authenticated reporters and approved jobs", () => {
    const policy = sql.match(
      /create\s+policy\s+reports_insert_authenticated\s+on\s+public\.reports[\s\S]*?;\s*$/im,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/auth\.uid\(\)\s+is\s+not\s+null/i);
    expect(policy).toMatch(/reporter_id\s*=\s*auth\.uid\(\)/i);
    expect(policy).toMatch(/status\s*=\s*'open'/i);
    expect(policy).toMatch(/j\.moderation_status\s*=\s*'approved'/i);
  });

  it("keeps report status updates admin-only", () => {
    const policy = sql.match(
      /create\s+policy\s+reports_update_admin\s+on\s+public\.reports[\s\S]*?;\s*$/im,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/using\s*\(\s*public\.is_admin\(\)\s*\)/i);
    expect(policy).toMatch(/with\s+check[\s\S]*?public\.is_admin\(\)/i);
    expect(policy).not.toMatch(/is_employer|current_profile_role\(\)\s*=\s*'seeker'/i);
  });
});
