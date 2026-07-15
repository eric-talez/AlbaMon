import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Exercises scripts/verify-beta-readiness.mjs: green on this repo and on a
 * minimal fixture, red when a Slice 28 invariant regresses — a missing
 * `RATE_LIMIT_HMAC_SECRET` in the env reference, an undocumented migration, a
 * resurrected "service-role client has no consumer" claim, a stale *current*
 * migration count, or a dropped runbook section. A Slice/PR-labeled *historical*
 * count stays green. The gate is offline by contract, so these tests need no
 * Docker, Supabase CLI, network, or env values.
 */

const SCRIPT = join(process.cwd(), "scripts/verify-beta-readiness.mjs");

function runScript(root: string) {
  const result = spawnSync(process.execPath, [SCRIPT, root], {
    encoding: "utf8",
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

const DISCLAIMERS =
  "This runbook is not a substitute for attorney review, and is not legal, " +
  "tax, immigration, or employment advice.";

const fixtureRoots: string[] = [];
afterAll(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Build a `docs/BETA_READINESS.md` body with sections `## 1.`..`## count.`. */
function runbook(count: number): string {
  const sections = Array.from(
    { length: count },
    (_, i) => `## ${i + 1}. Section ${i + 1}`,
  ).join("\n\n");
  return ["# Beta readiness (fixture)", "", sections, "", DISCLAIMERS, ""].join(
    "\n",
  );
}

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
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });

  writeFileSync(
    join(root, "supabase", "migrations", "0001_init.sql"),
    "select 1;\n",
  );
  writeFileSync(
    join(root, "supabase", "migrations", "0002_rate_limiting.sql"),
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
      "| 1 | `0001_init.sql` |",
      "| 2 | `0002_rate_limiting.sql` |",
      "",
      "The service-role key's only consumer is the rate limiter (`consume_rate_limit`).",
      "",
    ].join("\n"),
  );

  writeFileSync(join(root, "docs", "LAUNCH_CHECKLIST.md"), launchChecklist(2));
  writeFileSync(join(root, "docs", "BETA_READINESS.md"), runbook(17));

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
      "- `SUPABASE_SERVICE_ROLE_KEY` (**server-only**) — only consumer is the rate limiter (`consume_rate_limit`)",
      "- `RATE_LIMIT_HMAC_SECRET` (**server-only**)",
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
      join(root, "supabase", "migrations", "0003_extra.sql"),
      "select 1;\n",
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("0003_extra.sql");
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

  it("fails when the runbook is missing section 17", () => {
    const root = writeFixture();
    writeFileSync(join(root, "docs", "BETA_READINESS.md"), runbook(16));
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("## 17.");
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
