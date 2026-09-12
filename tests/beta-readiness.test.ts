import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Offline launch documentation gate: complete fixtures pass; missing settings,
 * migration drift, obsolete privilege claims and secret-shaped values fail.
 * Historical counts remain valid evidence of the source they actually tested.
 */

const SCRIPT = join(process.cwd(), "scripts/verify-beta-readiness.mjs");

function runScript(root: string) {
  const result = spawnSync(process.execPath, [SCRIPT, root], {
    encoding: "utf8",
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

const fixtureRoots: string[] = [];
afterAll(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Minimal `docs/LAUNCH_CHECKLIST.md` covering every required topic, claiming
 * `count` migrations. */
function launchChecklist(count: number): string {
  return [
    "# Launch checklist (fixture)",
    "",
    "## 1. Environment variables",
    "`NEXT_PUBLIC_SUPABASE_URL` and friends set.",
    "",
    "## 2. Migrations",
    `All ${count} migrations applied via \`supabase db push\`.`,
    "",
    "## 3. Seed / demo data",
    "Remove employer%@example.com rows.",
    "",
    "## 4. Admin setup",
    "Promote the founder via `role = 'admin'`.",
    "",
    "## 5. RLS review",
    "RLS holds on every table.",
    "",
    "## 6. Rollback",
    "Rollback procedure documented.",
    "",
  ].join("\n");
}

/** Minimal repo tree that passes every check in the beta gate (2 migrations). */
function writeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "kwork-beta-"));
  fixtureRoots.push(root);
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "docs", "launch-evidence"), { recursive: true });
  mkdirSync(join(root, "docs", "legal"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });

  writeFileSync(
    join(root, "supabase", "migrations", "20260621000000_init.sql"),
    "select 1;\n",
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20260714010000_rate_limiting.sql"),
    "select 1;\n",
  );

  writeFileSync(
    join(root, "docs", "DEPLOYMENT.md"),
    [
      "# Deployment (fixture)",
      "",
      "## 2. Supabase hosted project",
      "",
      "Apply all 2 migrations in filename order via `supabase db push`:",
      "",
      "| # | File |",
      "|---|---|",
      "| 1 | `20260621000000_init.sql` |",
      "| 2 | `20260714010000_rate_limiting.sql` |",
      "",
      "The service-role key supports trusted notification_outbox workers and optional local OTP consume_rate_limit calls.",
      "",
    ].join("\n"),
  );

  writeFileSync(join(root, "docs", "LAUNCH_CHECKLIST.md"), launchChecklist(2));
  writeFileSync(join(root, "docs", "BETA_READINESS.md"), "Historical guide: use DEPLOYMENT.md and LAUNCH_CHECKLIST.md.\n");
  writeFileSync(join(root, "docs", "launch-evidence", "environments.md"), "Actual hosted evidence remains unverified.\n");
  writeFileSync(join(root, "docs", "legal", "launch-policy-review.md"), "Reviewed operator facts are required for release.\n");
  writeFileSync(join(root, "vercel.json"), JSON.stringify({ buildCommand: "npm run build:release" }));

  writeFileSync(
    join(root, "docs", "PRODUCTION_ENV_VARS.md"),
    [
      "# Production env vars (fixture)",
      "",
      "Use a placeholder; never commit real values.",
      "",
      "- `NEXT_PUBLIC_SITE_URL`",
      "- `NEXT_PUBLIC_SUPABASE_URL`",
      "- `NEXT_PUBLIC_SUPABASE_ANON_KEY`",
      "- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**) — trusted notification_outbox workers and optional local OTP consume_rate_limit",
      "- `RATE_LIMIT_HMAC_SECRET` (**server-only**, optional while phone auth is disabled)",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(root, "docs", "OPERATIONAL_HEALTH.md"),
    "# Operational health (fixture)\n\nPresence-only checks; no network or DB probes.\n",
  );
  writeFileSync(
    join(root, "docs", "LOCAL_SUPABASE.md"),
    "# Local Supabase (fixture)\n\nDisposable local stack.\n",
  );
  writeFileSync(
    join(root, ".github", "workflows", "ci.yml"),
    "name: ci\non: [push]\n",
  );
  writeFileSync(join(root, "README.md"), "# Fixture\n");
  writeFileSync(
    join(root, ".env.example"),
    "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n",
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        scripts: { "verify:beta": "node scripts/verify-beta-readiness.mjs" },
      },
      null,
      2,
    ),
  );

  return root;
}

describe("verify-beta-readiness script", () => {
  it("passes against this repository", () => {
    const { status, output } = runScript(process.cwd());
    expect(output).toContain("RESULT: PASS");
    expect(status).toBe(0);
  });

  it("passes against a minimal complete fixture", () => {
    const { status, output } = runScript(writeFixture());
    expect(output).toContain("RESULT: PASS");
    expect(status).toBe(0);
  });

  it("fails when the env reference omits RATE_LIMIT_HMAC_SECRET", () => {
    const root = writeFixture();
    writeFileSync(
      join(root, "docs", "PRODUCTION_ENV_VARS.md"),
      [
        "# Production env vars (fixture)",
        "Use a placeholder; never commit real values.",
        "- `NEXT_PUBLIC_SITE_URL`",
        "- `NEXT_PUBLIC_SUPABASE_URL`",
        "- `NEXT_PUBLIC_SUPABASE_ANON_KEY`",
        "- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**) — consumer is the rate limiter (`consume_rate_limit`)",
        "",
      ].join("\n"),
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("RATE_LIMIT_HMAC_SECRET");
  });

  it("fails when a migration is not documented in DEPLOYMENT.md", () => {
    const root = writeFixture();
    writeFileSync(
      join(root, "supabase", "migrations", "20260911000000_extra.sql"),
      "select 1;\n",
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("20260911000000_extra.sql");
  });

  it("fails when a doc claims no app code path uses the service-role client", () => {
    const root = writeFixture();
    appendFileSync(
      join(root, "docs", "LAUNCH_CHECKLIST.md"),
      "\nNo app code path uses the service-role client.\n",
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("service-role");
  });

  it("fails when a runbook states a stale current migration count", () => {
    const root = writeFixture();
    // Inventory is 2, but the checklist now claims 5 (no historical marker).
    writeFileSync(join(root, "docs", "LAUNCH_CHECKLIST.md"), launchChecklist(5));
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("migrations does not match");
  });

  it("fails when the launch checklist loses its rollback procedure", () => {
    const root = writeFixture();
    writeFileSync(join(root, "docs", "LAUNCH_CHECKLIST.md"), launchChecklist(2).replace(/## 6\. Rollback[\s\S]*/, ""));
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("launch checklist no longer covers: rollback");
  });

  it("fails when the native production build no longer uses the release gate", () => {
    const root = writeFixture();
    writeFileSync(join(root, "vercel.json"), JSON.stringify({ buildCommand: "npm run build" }));
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("Vercel native release build command missing");
  });

  it("fails when migration history contains a duplicate version", () => {
    const root = writeFixture();
    writeFileSync(join(root, "supabase", "migrations", "20260621000000_duplicate.sql"), "select 1;\n");
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("duplicate migration history version");
  });

  it("fails when a scanned document contains a secret-shaped token without printing it", () => {
    const root = writeFixture();
    const token = ["eyJ" + "a".repeat(20), "b".repeat(20), "c".repeat(12)].join(".");
    appendFileSync(join(root, "docs", "PRODUCTION_ENV_VARS.md"), `\n${token}\n`);
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("jwt-shaped token");
    expect(output).not.toContain(token);
  });

  it("fails when the active notification service-role consumer is undocumented", () => {
    const root = writeFixture();
    for (const file of ["DEPLOYMENT.md", "PRODUCTION_ENV_VARS.md"]) {
      const path = join(root, "docs", file);
      writeFileSync(path, readFileSync(path, "utf8").replaceAll("notification_outbox", "background tasks"));
    }
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("notification_outbox");
  });

  it("preserves a clearly historical, Slice-labeled migration count", () => {
    const root = writeFixture();
    // Inventory is 2, but this labeled-historical line says 10 — must NOT fail.
    appendFileSync(
      join(root, "docs", "OPERATIONAL_HEALTH.md"),
      "\nHistorically, Slice 24 shipped with 10 migrations.\n",
    );
    const { status, output } = runScript(root);
    expect(output).toContain("RESULT: PASS");
    expect(status).toBe(0);
  });
});
