import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Exercises scripts/verify-local-supabase-readiness.mjs: green on this repo
 * and on a minimal fixture, red when the guide disappears or a secret-shaped /
 * hosted value is committed. The script is offline by contract, so these
 * tests need no Docker, Supabase CLI, network, or env values.
 */

const SCRIPT = join(process.cwd(), "scripts/verify-local-supabase-readiness.mjs");

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

/** Minimal repo tree that passes every check in the script. */
function writeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "kwork-local-supabase-"));
  fixtureRoots.push(root);
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });

  writeFileSync(
    join(root, "supabase", "config.toml"),
    [
      'project_id = "fixture"',
      "",
      "[db]",
      "port = 54322",
      "",
      "[db.seed]",
      "enabled = true",
      'sql_paths = ["./seed.sql"]',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "supabase", "migrations", "0001_init.sql"),
    "select 1;\n",
  );
  writeFileSync(join(root, "supabase", "seed.sql"), "-- fixture seed\n");
  writeFileSync(
    join(root, "supabase", "README.md"),
    "See docs/LOCAL_SUPABASE.md for the app-level walkthrough.\n",
  );

  writeFileSync(
    join(root, ".env.example"),
    [
      "NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
      "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
      "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false",
      "NEXT_PUBLIC_AUTH_PHONE_ENABLED=false",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(root, "docs", "LOCAL_SUPABASE.md"),
    [
      "# Local Supabase (fixture)",
      "",
      "```bash",
      "brew install supabase/tap/supabase",
      "supabase start",
      "supabase db reset",
      "```",
      "",
      "Copy the printed keys into `.env.local` and never commit them.",
      "",
      "Verify http://localhost:3000/api/health, http://localhost:3000/jobs,",
      "and http://localhost:3000/login.",
      "",
      "Admin promotion: `update public.profiles set role = 'admin' ...;`",
      "",
      "## 14. Resetting the local DB",
      "",
      "`supabase db reset` or `supabase stop`.",
      "",
      "## 15. Local Supabase vs hosted Supabase",
      "",
      "The hosted Supabase project is configured separately.",
      "",
      "## 16. What not to commit",
      "",
      "`.env.local` and printed keys.",
      "",
      "## 17. Manual local smoke checklist",
      "",
      "- [ ] everything above",
      "",
    ].join("\n"),
  );

  writeFileSync(
    join(root, "README.md"),
    "Fixture readme. Local stack guide: docs/LOCAL_SUPABASE.md\n",
  );
  for (const doc of [
    "BETA_READINESS.md",
    "LAUNCH_CHECKLIST.md",
    "AUTH_PROVIDERS.md",
  ]) {
    writeFileSync(
      join(root, "docs", doc),
      `Fixture doc. Rehearse locally first: LOCAL_SUPABASE.md\n`,
    );
  }

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        scripts: {
          "verify:local-supabase":
            "node scripts/verify-local-supabase-readiness.mjs",
        },
      },
      null,
      2,
    ),
  );

  return root;
}

describe("verify-local-supabase-readiness script", () => {
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

  it("fails when docs/LOCAL_SUPABASE.md is missing", () => {
    const root = writeFixture();
    rmSync(join(root, "docs", "LOCAL_SUPABASE.md"));
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("docs/LOCAL_SUPABASE.md");
    expect(output).toContain("RESULT: FAIL");
  });

  it("fails when a JWT-shaped value is committed to a scanned doc", () => {
    const root = writeFixture();
    // Built by concatenation so no JWT-shaped literal exists in this source
    // file (tests/security.test.ts scans every tracked file for that shape).
    const jwtShaped = ["eyJ" + "a".repeat(20), "b".repeat(20), "c".repeat(12)].join(".");
    appendFileSync(
      join(root, "docs", "LOCAL_SUPABASE.md"),
      `\nExample output: ${jwtShaped}\n`,
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("jwt-shaped token");
  });

  it("fails when a hosted Supabase project ref is committed to .env.example", () => {
    const root = writeFixture();
    appendFileSync(
      join(root, ".env.example"),
      `\n# pasted by mistake:\n# https://${"a".repeat(20)}.supabase.co\n`,
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("hosted supabase project ref");
  });

  it("fails when a test_otp block is committed to supabase/config.toml", () => {
    const root = writeFixture();
    appendFileSync(
      join(root, "supabase", "config.toml"),
      '\n[auth.sms.test_otp]\n15005550006 = "123456"\n',
    );
    const { status, output } = runScript(root);
    expect(status).toBe(1);
    expect(output).toContain("test_otp");
  });
});

describe("local Supabase guide wiring in this repo", () => {
  it("README links the local Supabase guide", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("docs/LOCAL_SUPABASE.md");
  });

  it("guide tells developers .env.local must never be committed", () => {
    const guide = readFileSync("docs/LOCAL_SUPABASE.md", "utf8");
    expect(guide).toMatch(/what not to commit/i);
    expect(guide).toContain("`.env.local`");
  });
});
