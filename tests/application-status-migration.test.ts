import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APPLICATION_STATUSES } from "@/lib/types";

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}

const sql = read(
  "supabase/migrations/20260627000000_application_status_workflow.sql",
);

describe("application status workflow migration", () => {
  it("constrains status to exactly the TypeScript APPLICATION_STATUSES set", () => {
    const check = sql.match(
      /constraint\s+applications_status_allowed[\s\S]*?check\s*\(\s*status\s+in\s*\(([^)]*)\)\s*\)/i,
    );
    expect(check).toBeTruthy();
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...APPLICATION_STATUSES]);
  });

  it("validates the new check constraint after adding it NOT VALID", () => {
    expect(sql).toMatch(/add\s+constraint\s+applications_status_allowed[\s\S]*?not\s+valid/i);
    expect(sql).toMatch(/validate\s+constraint\s+applications_status_allowed/i);
  });

  it("adds an employer update policy gated on current role and company ownership", () => {
    const policy = sql.match(
      /create\s+policy\s+applications_update_employer\s+on\s+public\.applications[\s\S]*?with\s+check\s*\([\s\S]*?\);/i,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/for\s+update/i);
    expect(policy).toMatch(/public\.is_employer\(\)/i);
    expect(policy).toMatch(/public\.is_admin\(\)/i);
    expect(policy).toMatch(/c\.owner_id\s*=\s*auth\.uid\(\)/i);
    // The post-change state must keep ownership and a supported status.
    expect(policy).toMatch(/with\s+check[\s\S]*?status\s+in\s*\(/i);
  });

  it("never grants a seeker update path on applications", () => {
    // No status migration may add a seeker-facing update policy.
    expect(sql).not.toMatch(/current_profile_role\(\)\s*=\s*'seeker'/i);
    expect(sql).not.toMatch(/applications_update_seeker/i);
  });

  it("restricts employer updates to the status column via a trigger", () => {
    const fn = sql.match(
      /function\s+public\.prevent_application_employer_field_change\(\)[\s\S]*?\$\$;/i,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/security\s+definer/i);
    expect(fn).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(fn).toMatch(/auth\.uid\(\)\s+is\s+not\s+null/i);
    expect(fn).toMatch(/auth\.role\(\)[\s\S]*?'service_role'/i);
    expect(fn).toMatch(/not\s+public\.is_admin\(\)/i);
    // Applicant-authored and ownership fields must be protected from employers.
    expect(fn).toMatch(/new\.seeker_id\s+is\s+distinct\s+from\s+old\.seeker_id/i);
    expect(fn).toMatch(/new\.cover_note\s+is\s+distinct\s+from\s+old\.cover_note/i);
    expect(fn).toMatch(/new\.job_id\s+is\s+distinct\s+from\s+old\.job_id/i);
    expect(fn).toMatch(/new\.updated_at\s+is\s+distinct\s+from\s+old\.updated_at/i);
    expect(fn).toMatch(/raise\s+exception/i);
    expect(sql).toMatch(
      /before\s+update\s+on\s+public\.applications[\s\S]*?execute\s+function\s+public\.prevent_application_employer_field_change/i,
    );
  });

  it("leaves the admin update path untouched (creates/alters no admin policy)", () => {
    expect(sql).not.toMatch(/create\s+policy\s+applications_update_admin/i);
    expect(sql).not.toMatch(/drop\s+policy[\s\S]*?applications_update_admin/i);
  });
});
