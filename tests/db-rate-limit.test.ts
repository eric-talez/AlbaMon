import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static assertions on the Slice 28 rate-limiter migration: table shape,
 * privacy constraints, locked-down grants/RLS, and the atomic SECURITY DEFINER
 * function. Text-only — no live database (the live proof is
 * supabase/tests/slice-28-rate-limiting.sql).
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const FILE = "20260714010000_server_rate_limiting.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, FILE), "utf8");
const lower = sql.toLowerCase();

/** Net effective grants for a grantee, replaying grant/revoke in file order. */
function netTableGrants(table: string, grantee: string): string[] {
  const ALL = ["select", "insert", "update", "delete"];
  const stmtRe = new RegExp(
    `(grant|revoke)\\s+([a-z,\\s]+?)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+(?:to|from)\\s+([a-z_,\\s]+);`,
    "gi",
  );
  const held = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8").toLowerCase();
    for (const m of text.matchAll(stmtRe)) {
      const roles = m[3].split(",").map((r) => r.trim());
      if (!roles.includes(grantee)) continue;
      const privs =
        m[2].trim() === "all"
          ? [...ALL]
          : m[2].split(",").map((p) => p.trim()).filter((p) => ALL.includes(p));
      for (const p of privs) {
        if (m[1] === "grant") held.add(p);
        else held.delete(p);
      }
    }
  }
  return [...held].sort();
}

describe("migration file naming", () => {
  it("is a 14-digit timestamped file that sorts after the Slice 27 migration", () => {
    expect(FILE).toMatch(/^\d{14}_.+\.sql$/);
    expect(FILE > "20260714000000_transactional_admin_audit_logs.sql").toBe(true);
  });
});

describe("rate_limit_buckets table", () => {
  it("creates the table with a bigint counter", () => {
    expect(lower).toContain("create table public.rate_limit_buckets");
    expect(lower).toMatch(/attempt_count\s+bigint\s+not null/);
  });

  it("uses a fixed-window composite primary key", () => {
    expect(lower).toMatch(/primary key\s*\(scope,\s*subject_hash,\s*window_start\)/);
  });

  it("constrains subject_hash to exactly 64 lowercase hex chars", () => {
    expect(sql).toMatch(/subject_hash\s*~\s*'\^\[0-9a-f\]\{64\}\$'/);
  });

  it("constrains a non-blank bounded scope, positive count, and sane expiry", () => {
    expect(lower).toMatch(/check\s*\(length\(btrim\(scope\)\)\s*>\s*0\)/);
    expect(lower).toMatch(/check\s*\(char_length\(scope\)\s*<=\s*100\)/);
    expect(lower).toMatch(/check\s*\(attempt_count\s*>=\s*1\)/);
    expect(lower).toMatch(/check\s*\(expires_at\s*>\s*window_start\)/);
  });

  it("indexes expires_at for bounded cleanup", () => {
    expect(lower).toMatch(/create index\s+\w+\s+on public\.rate_limit_buckets\s*\(expires_at\)/);
  });
});

describe("RLS and grants (service-role only)", () => {
  it("enables RLS and creates NO policies", () => {
    expect(lower).toContain("alter table public.rate_limit_buckets enable row level security");
    expect(lower).not.toMatch(/create policy\s+\w+\s+on public\.rate_limit_buckets/);
  });

  it("revokes all from the API roles and grants DML only to service_role", () => {
    expect(lower).toMatch(
      /revoke all on table public\.rate_limit_buckets from public, anon, authenticated;/,
    );
    expect(lower).toMatch(
      /grant select, insert, update, delete on table public\.rate_limit_buckets to service_role;/,
    );
  });

  it("nets to zero privileges for anon/authenticated and full DML for service_role", () => {
    expect(netTableGrants("rate_limit_buckets", "anon")).toEqual([]);
    expect(netTableGrants("rate_limit_buckets", "authenticated")).toEqual([]);
    expect(netTableGrants("rate_limit_buckets", "public")).toEqual([]);
    expect(netTableGrants("rate_limit_buckets", "service_role")).toEqual([
      "delete",
      "insert",
      "select",
      "update",
    ]);
  });
});

describe("consume_rate_limit function", () => {
  const fn = sql.match(
    /create or replace function public\.consume_rate_limit[\s\S]*?\$\$;/i,
  )?.[0];

  it("exists as a SECURITY DEFINER plpgsql function with a pinned empty search_path", () => {
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/security\s+definer/i);
    expect(fn).toMatch(/language\s+plpgsql/i);
    expect(fn).toMatch(/set\s+search_path\s*=\s*''/i);
  });

  it("uses prefixed parameters and a typed row return", () => {
    expect(fn).toMatch(/p_scope\s+text/i);
    expect(fn).toMatch(/p_subject_hash\s+text/i);
    expect(fn).toMatch(/p_max_attempts\s+integer/i);
    expect(fn).toMatch(/p_window_seconds\s+integer/i);
    expect(fn).toMatch(/returns\s+table\s*\(\s*allowed\s+boolean/i);
  });

  it("computes the window from database time, not a client value", () => {
    expect(fn).toMatch(/now\(\)/i);
    expect(fn).toMatch(/extract\(epoch from/i);
  });

  it("validates the subject hash format inside the function", () => {
    expect(fn).toMatch(/p_subject_hash\s*!~\s*'\^\[0-9a-f\]\{64\}\$'/i);
  });

  it("cleans up expired rows non-blockingly (indexed, SKIP LOCKED)", () => {
    expect(fn).toMatch(/for update skip locked/i);
    expect(fn).toMatch(/expires_at\s*<\s*v_now/i);
  });

  it("increments atomically with an overflow-safe cap and clamps the retry", () => {
    expect(fn).toMatch(/on conflict[\s\S]*?do update[\s\S]*?least\(/i);
    expect(fn).toMatch(/greatest\(\s*1,\s*least\(/i);
  });

  it("uses no dynamic SQL", () => {
    expect(fn).not.toMatch(/execute\s+format/i);
    expect(fn).not.toMatch(/execute\s+'/i);
  });

  it("is executable only by service_role", () => {
    expect(lower).toMatch(
      /revoke all on function public\.consume_rate_limit\(text, text, integer, integer\) from public, anon, authenticated;/,
    );
    expect(lower).toMatch(
      /grant execute on function public\.consume_rate_limit\(text, text, integer, integer\) to service_role;/,
    );
    expect(lower).not.toMatch(
      /grant execute on function public\.consume_rate_limit[^;]*to authenticated/,
    );
  });
});
