import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_AUDIT_ACTIONS } from "@/lib/types";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const sliceSql = readFileSync(
  join(MIGRATIONS_DIR, "20260714000000_transactional_admin_audit_logs.sql"),
  "utf8",
);

// Concatenated, filename-ordered migration text for final-state assertions
// (review_employer_access_request is defined in 20260706... and redefined in
// 20260714..., so live-state checks must read the LAST definition).
const allSql = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
  .join("\n");

interface AuditedFunction {
  name: string;
  signature: string;
  table: string;
  metadataKeys: string[];
}

const AUDITED_FUNCTIONS: AuditedFunction[] = [
  {
    name: "moderate_pending_job",
    signature: "(uuid, text)",
    table: "jobs",
    metadataKeys: ["decision", "from_status", "to_status"],
  },
  {
    name: "set_company_verification",
    signature: "(uuid, boolean)",
    table: "companies",
    metadataKeys: ["from_verified", "to_verified"],
  },
  {
    name: "review_report",
    signature: "(uuid, text)",
    table: "reports",
    metadataKeys: ["from_status", "to_status"],
  },
  {
    name: "review_employer_access_request",
    signature: "(uuid, text)",
    table: "employer_access_requests",
    metadataKeys: [
      "decision",
      "requester_id",
      "from_status",
      "to_status",
      "role_promoted",
    ],
  },
];

function lastFunctionDefinition(sql: string, name: string): string {
  const definition = [
    ...sql.matchAll(
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`,
        "gi",
      ),
    ),
  ].at(-1)?.[0];
  expect(definition, name).toBeTruthy();
  return definition!;
}

describe("transactional admin audit migration (Slice 27)", () => {
  it("defines every audited mutation as SECURITY DEFINER with an empty search_path", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name);
      expect(body, fn.name).toMatch(/security definer/i);
      expect(body, fn.name).toMatch(/set search_path = ''/i);
    }
  });

  it("requires a non-null auth.uid() and an admin caller in every function", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name);
      expect(body, fn.name).toMatch(
        /auth\.uid\(\) is null or not public\.is_admin\(\)/i,
      );
      expect(body, fn.name).toMatch(/raise exception 'Only an admin/i);
    }
  });

  it("validates the requested decision before touching any row", () => {
    expect(lastFunctionDefinition(sliceSql, "moderate_pending_job")).toMatch(
      /decision not in \('approved', 'rejected'\)/i,
    );
    expect(lastFunctionDefinition(sliceSql, "review_report")).toMatch(
      /decision not in \('reviewed', 'dismissed'\)/i,
    );
    expect(
      lastFunctionDefinition(sliceSql, "review_employer_access_request"),
    ).toMatch(/decision not in \('approved', 'rejected'\)/i);
    expect(lastFunctionDefinition(sliceSql, "set_company_verification")).toMatch(
      /verified is null/i,
    );
  });

  it("locks the target row with FOR UPDATE before mutating it", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name).toLowerCase();
      const lockIndex = body.indexOf("for update");
      const mutationIndex = body.indexOf(`update public.${fn.table}`);
      expect(lockIndex, fn.name).toBeGreaterThan(-1);
      expect(mutationIndex, fn.name).toBeGreaterThan(-1);
      expect(lockIndex, fn.name).toBeLessThan(mutationIndex);
    }
  });

  it("performs the entity mutation and exactly one audit insert in the same function", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name);
      expect(body, fn.name).toMatch(
        new RegExp(`update public\\.${fn.table}`, "i"),
      );
      const inserts = body.match(/insert into public\.audit_logs/gi) ?? [];
      expect(inserts.length, fn.name).toBe(1);
    }
    // ...and no audit inserts exist outside these four functions.
    const totalInserts = sliceSql.match(/insert into public\.audit_logs/gi) ?? [];
    expect(totalInserts.length).toBe(AUDITED_FUNCTIONS.length);
  });

  it("returns conflict before the audit-insert path so stale reviews write nothing", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name).toLowerCase();
      const conflictIndex = body.indexOf("return 'conflict'");
      const insertIndex = body.indexOf("insert into public.audit_logs");
      expect(conflictIndex, fn.name).toBeGreaterThan(-1);
      expect(conflictIndex, fn.name).toBeLessThan(insertIndex);
    }
  });

  it("derives the actor from auth.uid() and never from a parameter", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name);
      expect(body, fn.name).toMatch(/values \(\s*auth\.uid\(\),/i);
      const args = body.match(
        new RegExp(`function public\\.${fn.name}\\(([\\s\\S]*?)\\)`, "i"),
      )?.[1];
      expect(args, fn.name).toBeTruthy();
      expect(args, fn.name).not.toMatch(/actor/i);
    }
  });

  it("writes only taxonomy action values as literals", () => {
    const actionLiterals = [
      ...sliceSql.matchAll(
        /'((?:job|company|report|employer_access)\.[a-z_]+)'/g,
      ),
    ].map((match) => match[1]);
    expect([...new Set(actionLiterals)].sort()).toEqual(
      [...ADMIN_AUDIT_ACTIONS].sort(),
    );
  });

  it("keeps audit metadata minimal and free of PII fields", () => {
    const builders = [...sliceSql.matchAll(/jsonb_build_object\(([^)]*)\)/gi)];
    expect(builders.length).toBe(AUDITED_FUNCTIONS.length);
    for (const fn of AUDITED_FUNCTIONS) {
      const body = lastFunctionDefinition(sliceSql, fn.name);
      const builder = body.match(/jsonb_build_object\(([^)]*)\)/i)?.[1] ?? "";
      const keys = [...builder.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      expect(keys, fn.name).toEqual(fn.metadataKeys);
      expect(builder, fn.name).not.toMatch(
        /email|phone|address|business_name|contact_name|website|details|description|notes/i,
      );
    }
  });

  it("locks execution to authenticated callers only", () => {
    for (const fn of AUDITED_FUNCTIONS) {
      const escaped = fn.signature.replace(/[()]/g, "\\$&");
      expect(sliceSql).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn.name}${escaped} from public, anon, authenticated`,
          "i",
        ),
      );
      expect(sliceSql).toMatch(
        new RegExp(
          `grant execute on function public\\.${fn.name}${escaped} to authenticated`,
          "i",
        ),
      );
    }
    const grantees = [
      ...sliceSql.matchAll(/grant execute on function [^;]* to ([a-z_]+);/gi),
    ].map((match) => match[1]);
    expect(grantees.length).toBeGreaterThan(0);
    expect(new Set(grantees)).toEqual(new Set(["authenticated"]));
  });

  it("adds no audit_logs table grants or policies (definer-owner writes only)", () => {
    expect(sliceSql).not.toMatch(
      /grant [^;]* on (table )?public\.audit_logs/i,
    );
    expect(sliceSql).not.toMatch(/create policy [^;]* on public\.audit_logs/i);
    expect(sliceSql).not.toMatch(/drop policy [^;]*audit_logs_select_admin/i);
    // Final state across every migration: the admin SELECT policy is still the
    // only audit_logs policy, so authenticated clients gain no write path.
    const auditPolicies = [
      ...allSql.matchAll(
        /create\s+policy\s+\w+\s+on\s+public\.audit_logs\s+for\s+(\w+)/gi,
      ),
    ].map((match) => match[1].toLowerCase());
    expect(auditPolicies).toEqual(["select"]);
    expect(allSql).toMatch(/create policy audit_logs_select_admin/i);
  });

  it("introduces no generic audit-write RPC", () => {
    const argLists = [
      ...sliceSql.matchAll(
        /create or replace function public\.[a-z_]+\(([\s\S]*?)\)\s*returns/gi,
      ),
    ].map((match) => match[1]);
    for (const args of argLists) {
      expect(args).not.toMatch(/action|entity_type|entity_id|metadata/i);
    }
    expect(sliceSql).not.toMatch(/function public\.(record|write|log)_audit/i);
  });

  it("blocks ordinary API roles from UPDATE/DELETE on audit rows while sparing trusted maintenance", () => {
    const guard = lastFunctionDefinition(sliceSql, "prevent_audit_log_mutation");
    // SECURITY INVOKER on purpose: the guard keys on the session's role
    // identity, so owner maintenance, service_role repair, restores, and the
    // actor_id ON DELETE SET NULL cascade (referential actions run as the
    // table owner) all pass.
    expect(guard).not.toMatch(/security definer/i);
    expect(guard).toMatch(/set search_path = ''/i);
    expect(guard).toMatch(/current_user in \('anon', 'authenticated'\)/i);
    // Role identity, not JWT-claim presence.
    expect(guard).not.toMatch(/auth\.(uid|role)\(\)/i);
    expect(guard).toMatch(/errcode = '42501'/i);
    // BEFORE DELETE must return OLD (NEW is null on delete) or trusted deletes
    // would be silently skipped.
    expect(guard).toMatch(/return old/i);
    // Admins are deliberately NOT exempt: they act through the authenticated
    // role, and audit history is append-only for ordinary API sessions.
    expect(guard).not.toMatch(/is_admin/i);
    expect(sliceSql).toMatch(
      /create trigger audit_logs_prevent_mutation\s+before update or delete on public\.audit_logs\s+for each row/i,
    );
  });

  it("extends the live employer-access review with the transactional audit write", () => {
    const finalReview = lastFunctionDefinition(
      allSql,
      "review_employer_access_request",
    );
    expect(finalReview).toMatch(/insert into public\.audit_logs/i);
    expect(finalReview).toMatch(/get diagnostics v_promoted_count = row_count/i);
    expect(finalReview).toMatch(/v_role_promoted := v_promoted_count = 1/i);
    expect(finalReview).toMatch(/'role_promoted', v_role_promoted/i);
    // Original review semantics survive the redefinition.
    expect(finalReview).toMatch(/target\.status <> 'pending'/i);
    expect(finalReview).toMatch(/reviewed_by = auth\.uid\(\)/i);
    expect(finalReview).toMatch(/reviewed_at = now\(\)/i);
    const approvalBranch = finalReview.match(
      /if decision = 'approved' then([\s\S]*?)end if;/i,
    )?.[1];
    expect(approvalBranch).toBeTruthy();
    expect(approvalBranch).toMatch(/update public\.profiles/i);
    expect(approvalBranch).toMatch(/role = 'seeker'/i);
  });
});
