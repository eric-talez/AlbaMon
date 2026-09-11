import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const section = readFileSync("docs/DEPLOYMENT.md", "utf8").split("## Staging migrations")[1].split("\n## ")[0];
const [prepare, apply] = [...section.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "staging-guard-")); roots.push(root);
  const repo = join(root, "repo"), bin = join(root, "bin"), record = join(root, "record");
  for (const path of [bin, join(repo, "supabase/.temp"), join(repo, "supabase/migrations"), join(repo, "docs/launch-evidence")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(repo, ".gitignore"), "supabase/.temp/\n");
  writeFileSync(join(repo, "supabase/migrations/001.sql"), "select 1;\n");
  const manifest = `${hash("select 1;\n")}  supabase/migrations/001.sql\n`;
  writeFileSync(join(repo, "docs/launch-evidence/migrations.sha256"), manifest);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("add", "."); git("-c", "user.name=Guard Test", "-c", "user.email=guard@example.invalid", "commit", "-qm", "approved");
  // Real target validation; only the external Supabase boundary is replaced.
  writeFileSync(join(bin, "npm"), '#!/bin/sh\nexec "$NODE_BINARY" "$TARGET_GUARD" "$4"\n', { mode: 0o700 });
  writeFileSync(join(bin, "supabase"), `#!/bin/sh
case "$*" in
  "link --project-ref $STAGING_PROJECT_REF")
    test "$FAIL_LINK" != true || exit 1
    printf '%s' "$STAGING_PROJECT_REF" > supabase/.temp/project-ref ;;
  "migration list --linked") echo '001 pending' ;;
  "db push --dry-run") touch "$DRY_MARKER"; echo 'pending 001' ;;
  "db push") touch "$PUSH_MARKER" ;;
  *) exit 2 ;;
esac
`, { mode: 0o700 });
  const env = {
    NODE_ENV: "test" as const,
    PATH: `${bin}:${process.env.PATH}`, NODE_BINARY: process.execPath, TARGET_GUARD: resolve("scripts/check-deploy-target.mjs"),
    STAGING_PROJECT_REF: "abcdefghijklmnopqrst", PRODUCTION_PROJECT_REF: "uvwxyzabcdefghijklmn",
    STAGING_ORIGIN: "https://staging.k-work.test", PRODUCTION_ORIGIN: "https://jobs.k-work.test",
    NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SITE_URL: "https://staging.k-work.test",
    EMAIL_ENVIRONMENT: "staging", NEXT_PUBLIC_INDEXING_ENABLED: "false", FAIL_LINK: "false",
    RECORD_DIR: record, APPROVED_RELEASE_SHA: git("rev-parse", "HEAD"), APPROVED_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
    APPROVED_MANIFEST_SHA256: hash(manifest), APPROVED_DRY_RUN_SHA256: hash("pending 001\n"),
    PUSH_MARKER: join(root, "pushed"), DRY_MARKER: join(root, "dry-run"),
  };
  writeFileSync(join(repo, "supabase/.temp/project-ref"), env.PRODUCTION_PROJECT_REF);
  const run = (block: string, patch = {}) => spawnSync("bash", ["-c", block], { cwd: repo, env: { ...env, ...patch }, encoding: "utf8" });
  return { repo, record, env, run };
}

test.each([
  ["missing staging mapping", { STAGING_PROJECT_REF: "" }],
  ["wrong staging mapping", { NEXT_PUBLIC_SUPABASE_URL: "https://uvwxyzabcdefghijklmn.supabase.co" }],
  ["failed link with stale production link", { FAIL_LINK: "true" }],
])("staging preparation stops before dry-run: %s", (_label, patch) => {
  const f = fixture();
  expect(f.run(prepare, patch).status).not.toBe(0);
  expect(existsSync(f.env.DRY_MARKER)).toBe(false);
  expect(existsSync(f.env.PUSH_MARKER)).toBe(false);
});

test("approved staging preparation and receipt permit the subsequent apply", () => {
  const f = fixture();
  expect(f.run(prepare).status).toBe(0);
  expect(existsSync(f.env.DRY_MARKER)).toBe(true);
  expect(existsSync(f.env.PUSH_MARKER)).toBe(false);
  expect(f.run(apply).status).toBe(0);
  expect(existsSync(f.env.PUSH_MARKER)).toBe(true);
});

test.each([
  ["missing mapping", { STAGING_PROJECT_REF: "" }],
  ["wrong mapping", { NEXT_PUBLIC_SUPABASE_URL: "https://uvwxyzabcdefghijklmn.supabase.co" }],
  ["unapproved source", { APPROVED_RELEASE_SHA: "b".repeat(40) }],
  ["unapproved target", { APPROVED_STAGING_PROJECT_REF: "uvwxyzabcdefghijklmn" }],
  ["missing manifest approval", { APPROVED_MANIFEST_SHA256: "" }],
  ["wrong manifest approval", { APPROVED_MANIFEST_SHA256: "b".repeat(64) }],
  ["wrong dry-run approval", { APPROVED_DRY_RUN_SHA256: "b".repeat(64) }],
])("staging apply refuses %s before push", (_label, patch) => {
  const f = fixture(); expect(f.run(prepare).status).toBe(0);
  expect(f.run(apply, patch).status).not.toBe(0);
  expect(existsSync(f.env.PUSH_MARKER)).toBe(false);
});

test.each(["stale production link", "dirty source", "changed dry-run"])("staging apply refuses %s after preparation", change => {
  const f = fixture(); expect(f.run(prepare).status).toBe(0);
  if (change === "stale production link") writeFileSync(join(f.repo, "supabase/.temp/project-ref"), f.env.PRODUCTION_PROJECT_REF);
  if (change === "dirty source") writeFileSync(join(f.repo, "supabase/migrations/001.sql"), "select 2;\n");
  if (change === "changed dry-run") writeFileSync(join(f.record, "dry-run.txt"), "changed\n");
  expect(f.run(apply).status).not.toBe(0);
  expect(existsSync(f.env.PUSH_MARKER)).toBe(false);
});
