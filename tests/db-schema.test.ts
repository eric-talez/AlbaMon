import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ROLES,
  JOB_TYPES,
  PAY_UNITS,
  LANGUAGE_REQUIREMENTS,
  JOB_CATEGORIES,
  MODERATION_STATUSES,
} from "@/lib/types";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SEED_PATH = join(process.cwd(), "supabase", "seed.sql");

function migrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
}

/** Concatenated text of all migration files (there is one in Slice 3). */
function migrationSql(): string {
  return migrationFiles()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

function seedSql(): string {
  return readFileSync(SEED_PATH, "utf8");
}

function latestPolicy(sql: string, name: string): string | undefined {
  const matches = [
    ...sql.matchAll(
      new RegExp(
        `create\\s+policy\\s+${name}\\s+on\\s+public\\.\\w+[\\s\\S]*?;`,
        "gi",
      ),
    ),
  ];
  return matches.at(-1)?.[0];
}

/**
 * Net table-level privileges a grantee effectively holds after every GRANT and
 * REVOKE on `table` is applied across all migrations in filename (chronological)
 * order, statement by statement. Unlike a GRANT-text scan, this nets out later
 * REVOKEs — a grant followed by a later revoke reads as no privilege — so the
 * assertion reflects the *effective* grant, not merely that grant text exists.
 * `all` expands to the four DML privileges. Roles are matched by exact name
 * (the migrations always list anon/authenticated/public explicitly).
 */
function netTableGrants(table: string, grantee: string): string[] {
  const ALL = ["select", "insert", "update", "delete"];
  const stmtRe = new RegExp(
    `(grant|revoke)\\s+([a-z,\\s]+?)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+(?:to|from)\\s+([a-z_,\\s]+);`,
    "gi",
  );
  const held = new Set<string>();
  for (const file of migrationFiles().sort()) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8").toLowerCase();
    for (const m of text.matchAll(stmtRe)) {
      const roles = m[3].split(",").map((r) => r.trim());
      if (!roles.includes(grantee)) continue;
      const privileges =
        m[2].trim() === "all"
          ? [...ALL]
          : m[2].split(",").map((p) => p.trim()).filter((p) => ALL.includes(p));
      for (const p of privileges) {
        if (m[1] === "grant") held.add(p);
        else held.delete(p);
      }
    }
  }
  return [...held].sort();
}

describe("migration exists and enables RLS", () => {
  it("ships a timestamp-named initial migration", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => /^\d{14}_.+\.sql$/.test(f))).toBe(true);
  });

  it("enables row level security on every core table", () => {
    const sql = migrationSql().toLowerCase();
    const tables = [
      "profiles",
      "companies",
      "jobs",
      "applications",
      "messages",
      "reports",
      "audit_logs",
      "employer_access_requests",
    ];
    for (const t of tables) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
  });
});

describe("SQL enums match TypeScript constants", () => {
  // Map each SQL enum type name to the authoritative TS const array.
  const expected: Record<string, readonly string[]> = {
    user_role: ROLES,
    job_type: JOB_TYPES,
    pay_unit: PAY_UNITS,
    language_requirement: LANGUAGE_REQUIREMENTS,
    job_category: JOB_CATEGORIES,
    moderation_status: MODERATION_STATUSES,
    // The SQL enum is retained even though the app no longer defines a
    // BOOST_TYPES constant (paid boosts were de-scoped in Slice 23).
    boost_type: ["featured", "urgent"],
  };

  /** Parse `create type public.<name> as enum ( 'a', 'b' )` blocks. */
  function parseEnums(sql: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    const re =
      /create\s+type\s+public\.(\w+)\s+as\s+enum\s*\(([\s\S]*?)\)\s*;/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const name = m[1];
      const values = [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]);
      out[name] = values;
    }
    return out;
  }

  const parsed = parseEnums(migrationSql());

  for (const [name, values] of Object.entries(expected)) {
    it(`enum ${name} has the same values, in order, as TS`, () => {
      expect(parsed[name]).toEqual([...values]);
    });
  }
});

describe("no unsafe RLS patterns", () => {
  const sql = migrationSql();

  it("blocks self-promotion: profile self-update is pinned to current role", () => {
    // The own-update policy must constrain `role` to the caller's current role.
    expect(sql).toMatch(/role\s*=\s*public\.current_profile_role\(\)/);
  });

  it("never grants an unconditional update on profiles", () => {
    // No policy may allow `for update ... using (true)` on profiles.
    expect(sql).not.toMatch(/on\s+public\.profiles[\s\S]*?for\s+update[\s\S]*?using\s*\(\s*true\s*\)/i);
  });

  it("forces employer-created jobs to 'pending' (no self-publish)", () => {
    expect(sql).toMatch(
      /jobs_insert_owner[\s\S]*?with\s+check[\s\S]*?moderation_status\s*=\s*'pending'/i,
    );
  });

  it("prevents employer company verification and job boost assignment", () => {
    const companyInsert = latestPolicy(sql, "companies_insert_owner");
    const jobInsert = latestPolicy(sql, "jobs_insert_owner");
    expect(companyInsert).toMatch(/is_verified\s*=\s*false/i);
    expect(jobInsert).toMatch(/moderation_status\s*=\s*'pending'/i);
    expect(jobInsert).toMatch(/boost\s+is\s+null/i);
  });

  it("allows only admin, service-role, or trusted DB execution to change verification/boost", () => {
    for (const name of [
      "prevent_company_verification_change",
      "prevent_job_boost_change",
    ]) {
      const fn = sql.match(
        new RegExp(`function\\s+public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, "i"),
      )?.[0];
      expect(fn, name).toBeTruthy();
      expect(fn, name).toMatch(/security\s+definer/i);
      expect(fn, name).toMatch(/set\s+search_path\s*=\s*''/i);
      expect(fn, name).toMatch(/auth\.uid\(\)\s+is\s+not\s+null/i);
      expect(fn, name).toMatch(/auth\.role\(\)[\s\S]*?'service_role'/i);
      expect(fn, name).toMatch(/not\s+public\.is_admin\(\)/i);
      expect(fn, name).toMatch(/raise\s+exception/i);
    }
    expect(sql).toMatch(/before\s+update\s+of\s+is_verified\s+on\s+public\.companies/i);
    expect(sql).toMatch(/before\s+update\s+of\s+boost\s+on\s+public\.jobs/i);
  });

  it("has a defensive trigger blocking profile role self-update", () => {
    // Function + the BEFORE UPDATE OF role trigger must both be present.
    expect(sql).toMatch(/function\s+public\.prevent_profile_role_self_update/i);
    expect(sql).toMatch(
      /before\s+update\s+of\s+role\s+on\s+public\.profiles[\s\S]*?execute\s+function\s+public\.prevent_profile_role_self_update/i,
    );
  });

  it("the role trigger raises unless the actor is an admin", () => {
    // Body must compare old/new role and gate on is_admin(), then raise.
    const fn = sql.match(
      /function\s+public\.prevent_profile_role_self_update[\s\S]*?\$\$;/i,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/new\.role\s+is\s+distinct\s+from\s+old\.role/i);
    expect(fn).toMatch(/not\s+public\.is_admin\(\)/i);
    expect(fn).toMatch(/raise\s+exception/i);
  });

  it("only seeker-role profiles may insert applications", () => {
    const policy = latestPolicy(sql, "applications_insert_seeker");
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/seeker_id\s*=\s*auth\.uid\(\)/i);
    expect(policy).toMatch(/current_profile_role\(\)\s*=\s*'seeker'/i);
    expect(policy).toMatch(/moderation_status\s*=\s*'approved'/i);
    expect(policy).toMatch(/status\s*=\s*'submitted'/i);
  });

  it("bounds cover notes and preserves one application per seeker/job", () => {
    expect(sql).toMatch(
      /constraint\s+applications_cover_note_max_length[\s\S]*?char_length\(cover_note\)\s*<=\s*1000/i,
    );
    expect(sql).toMatch(
      /constraint\s+applications_unique_per_seeker\s+unique\s*\(job_id,\s*seeker_id\)/i,
    );
  });

  it("company insert/update require an employer or admin role", () => {
    const insert = sql.match(
      /create\s+policy\s+companies_insert_owner[\s\S]*?;/i,
    )?.[0];
    const update = sql.match(
      /create\s+policy\s+companies_update_owner[\s\S]*?;/i,
    )?.[0];
    for (const policy of [insert, update]) {
      expect(policy).toBeTruthy();
      expect(policy).toMatch(/public\.is_employer\(\)/i);
      expect(policy).toMatch(/public\.is_admin\(\)/i);
    }
  });

  it("all owner-only reads and job writes require the current employer/admin role", () => {
    const policyNames = [
      "companies_select_owner",
      "jobs_select_owner",
      "jobs_insert_owner",
      "jobs_update_owner",
      "applications_select_employer",
    ];
    for (const name of policyNames) {
      const policy = latestPolicy(sql, name);
      expect(policy, name).toBeTruthy();
      expect(policy, name).toMatch(/public\.is_employer\(\)/i);
      expect(policy, name).toMatch(/public\.is_admin\(\)/i);
    }
  });

  it("exposes approved jobs through a read-only view with safe company identity", () => {
    const view = sql.match(
      /create\s+view\s+public\.public_job_listings[\s\S]*?where\s+j\.moderation_status\s*=\s*'approved'\s*;/i,
    )?.[0];
    expect(view).toBeTruthy();
    expect(view).toMatch(/c\.name\s+as\s+company_name/i);
    expect(view).toMatch(/c\.is_verified\s+as\s+company_is_verified/i);
    expect(view).not.toMatch(/c\.(?:phone|website|address_display)/i);
    expect(sql).toMatch(
      /grant\s+select\s+on\s+public\.public_job_listings\s+to\s+anon,\s*authenticated/i,
    );
  });

  it("restricts seeker and employer application listing RPCs to their callers", () => {
    const seekerFunction = sql.match(
      /function\s+public\.list_seeker_applications\(\)[\s\S]*?\$\$;/i,
    )?.[0];
    const employerFunction = sql.match(
      /function\s+public\.list_employer_applications\(\)[\s\S]*?\$\$;/i,
    )?.[0];

    expect(seekerFunction).toBeTruthy();
    expect(seekerFunction).toMatch(/security\s+definer/i);
    expect(seekerFunction).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(seekerFunction).toMatch(/current_profile_role\(\)\s*=\s*'seeker'/i);
    expect(seekerFunction).toMatch(/a\.seeker_id\s*=\s*auth\.uid\(\)/i);
    expect(seekerFunction).toMatch(/order\s+by\s+a\.created_at\s+desc/i);

    expect(employerFunction).toBeTruthy();
    expect(employerFunction).toMatch(/security\s+definer/i);
    expect(employerFunction).toMatch(/set\s+search_path\s*=\s*''/i);
    expect(employerFunction).toMatch(/current_profile_role\(\)\s*=\s*'employer'/i);
    expect(employerFunction).toMatch(/c\.owner_id\s*=\s*auth\.uid\(\)/i);
    expect(employerFunction).toMatch(/order\s+by\s+a\.created_at\s+desc/i);
    expect(employerFunction).toMatch(/p\.display_name\s+as\s+applicant_display_name/i);
    expect(employerFunction).toMatch(/p\.email\s+as\s+applicant_email/i);
    expect(employerFunction).not.toMatch(/p\.(?:phone|city|state)|metadata/i);
  });

  it("revokes default application RPC execution before granting authenticated access", () => {
    for (const name of [
      "list_seeker_applications",
      "list_employer_applications",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\(\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\(\\)\\s+to\\s+authenticated`,
          "i",
        ),
      );
    }
  });

  it("audit_logs has no insert/update/delete policy (service-role only)", () => {
    const auditPolicies = [...sql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.audit_logs\s+for\s+(\w+)/gi)].map(
      (m) => m[1].toLowerCase(),
    );
    expect(auditPolicies).toEqual(["select"]);
  });
});

describe("explicit table grants for API roles", () => {
  // Supabase no longer grants implicit table privileges to anon/authenticated/
  // service_role on new projects, so every table must carry explicit grants or
  // real sign-ins fail closed at the profiles.role lookup (42501).
  const sql = migrationSql();

  function grantsFor(table: string, grantee: string): string[] {
    return [
      ...sql.matchAll(
        new RegExp(
          `grant\\s+([a-z,\\s]+?)\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+([a-z_,\\s]+);`,
          "gi",
        ),
      ),
    ]
      .filter((m) =>
        m[2].split(",").map((r) => r.trim().toLowerCase()).includes(grantee),
      )
      .flatMap((m) => m[1].split(",").map((p) => p.trim().toLowerCase()));
  }

  it("lets authenticated users read and update (never insert/delete) profiles", () => {
    const privileges = grantsFor("profiles", "authenticated");
    expect(privileges).toContain("select");
    expect(privileges).toContain("update");
    expect(privileges).not.toContain("insert");
    expect(privileges).not.toContain("delete");
  });

  it("grants authenticated DML on every RLS-gated app table it must reach", () => {
    for (const table of ["jobs", "companies", "applications", "reports"]) {
      const privileges = grantsFor(table, "authenticated");
      expect(privileges, table).toContain("select");
      expect(privileges, table).toContain("insert");
      expect(privileges, table).not.toContain("delete");
    }
    expect(grantsFor("employer_access_requests", "authenticated")).toContain("select");
    expect(grantsFor("audit_logs", "authenticated")).toContain("select");
  });

  it("keeps anon read-only on jobs and off companies + every private table", () => {
    // anon reads approved jobs only. Company identity reaches the public
    // through the public_job_listings view, never the companies base table
    // (Slice 25 revoked the anon SELECT and dropped the public verified policy).
    expect(netTableGrants("jobs", "anon")).toEqual(["select"]);
    for (const table of [
      "companies",
      "profiles",
      "applications",
      "reports",
      "employer_access_requests",
      "audit_logs",
      "messages",
    ]) {
      expect(netTableGrants(table, "anon"), table).toEqual([]);
    }
  });

  it("restores the service_role DML surface on all app tables", () => {
    for (const table of [
      "profiles",
      "jobs",
      "companies",
      "applications",
      "reports",
      "employer_access_requests",
      "audit_logs",
      "messages",
    ]) {
      const privileges = grantsFor(table, "service_role");
      for (const privilege of ["select", "insert", "update", "delete"]) {
        expect(privileges, `${table}: ${privilege}`).toContain(privilege);
      }
    }
  });
});

describe("companies base table is not publicly or seeker readable (Slice 25)", () => {
  const sql = migrationSql();

  it("drops the public verified-company SELECT policy and leaves it dropped", () => {
    expect(sql).toMatch(
      /drop\s+policy\s+if\s+exists\s+companies_select_public_verified\s+on\s+public\.companies/i,
    );
    // The init migration still CREATEs it, so a plain text scan can't prove it
    // is gone. Walk create/drop events in filename (chronological) order: the
    // final event for this policy must be the drop, i.e. it ends up removed.
    const events: string[] = [];
    for (const file of migrationFiles().sort()) {
      const text = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      for (const m of text.matchAll(
        /(create|drop)\s+policy\s+(?:if\s+exists\s+)?companies_select_public_verified/gi,
      )) {
        events.push(m[1].toLowerCase());
      }
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events.at(-1)).toBe("drop");
  });

  it("revokes anon SELECT on the companies base table (net: no anon grant)", () => {
    expect(sql).toMatch(
      /revoke\s+select\s+on\s+(?:table\s+)?public\.companies\s+from\s+[^;]*\banon\b/i,
    );
    expect(netTableGrants("companies", "anon")).toEqual([]);
    expect(netTableGrants("companies", "public")).toEqual([]);
  });

  it("retains owner and admin company SELECT policies", () => {
    const owner = latestPolicy(sql, "companies_select_owner");
    const admin = latestPolicy(sql, "companies_select_admin");
    expect(owner).toBeTruthy();
    expect(owner).toMatch(/owner_id\s*=\s*auth\.uid\(\)/i);
    expect(admin).toBeTruthy();
    expect(admin).toMatch(/public\.is_admin\(\)/i);
  });

  it("keeps the authenticated grant so owner/admin RLS can still return rows, without broadening mutation", () => {
    // authenticated needs SELECT for the owner/admin policies to expose rows;
    // insert/update are unchanged and there is still no DELETE.
    expect(netTableGrants("companies", "authenticated")).toEqual([
      "insert",
      "select",
      "update",
    ]);
  });

  it("still exposes safe company identity via public_job_listings to anon + authenticated", () => {
    expect(sql).toMatch(
      /grant\s+select\s+on\s+public\.public_job_listings\s+to\s+anon,\s*authenticated/i,
    );
  });
});

describe("seed data shape", () => {
  const seed = seedSql();

  it("inserts at least 3 companies", () => {
    const companies = [...seed.matchAll(/'aaaaaaaa-0000-0000-0000-\d{12}'/g)];
    // Count distinct company UUIDs referenced as primary keys in the insert.
    const distinct = new Set(companies.map((c) => c[0]));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });

  it("has at least 8 approved jobs and at least one pending and one draft/rejected", () => {
    const approved = (seed.match(/'approved'/g) ?? []).length;
    const pending = (seed.match(/'pending'/g) ?? []).length;
    const draftOrRejected =
      (seed.match(/'draft'/g) ?? []).length +
      (seed.match(/'rejected'/g) ?? []).length;
    expect(approved).toBeGreaterThanOrEqual(8);
    expect(pending).toBeGreaterThanOrEqual(1);
    expect(draftOrRejected).toBeGreaterThanOrEqual(1);
  });
});

describe("no forbidden brand or secrets in DB files", () => {
  function dbTextFiles(): string[] {
    const out: string[] = [];
    for (const f of migrationFiles()) out.push(join(MIGRATIONS_DIR, f));
    out.push(SEED_PATH);
    const supaReadme = join(process.cwd(), "supabase", "README.md");
    const dbDoc = join(process.cwd(), "docs", "DATABASE.md");
    if (existsSync(supaReadme)) out.push(supaReadme);
    if (existsSync(dbDoc)) out.push(dbDoc);
    return out;
  }

  const forbiddenBrandNames = [
    ["alba", "mon"].join(""),
    ["알바", "몬"].join(""),
  ];

  it("never exposes forbidden/confusable brand names", () => {
    const offenders: string[] = [];
    for (const file of dbTextFiles()) {
      const content = readFileSync(file, "utf8").toLowerCase();
      if (forbiddenBrandNames.some((bad) => content.includes(bad))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no real secret material", () => {
    const secretPatterns: { name: string; re: RegExp }[] = [
      { name: "stripe-live-key", re: /sk_live_[0-9a-zA-Z]{16,}/ },
      { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
      { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
      { name: "jwt-token", re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
    ];
    const offenders: string[] = [];
    for (const file of dbTextFiles()) {
      const content = readFileSync(file, "utf8");
      for (const { name, re } of secretPatterns) {
        if (re.test(content)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
