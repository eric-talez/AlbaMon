#!/usr/bin/env node
/**
 * verify-beta-readiness.mjs - offline docs gate for the California public launch.
 *
 * Usage:
 *   npm run verify:beta
 *   node scripts/verify-beta-readiness.mjs [repo-root]
 *
 * Read-only and self-contained: no network, no credentials, no Supabase or
 * Vercel access, no writes. It verifies repo-level launch-readiness
 * assumptions only:
 *
 *   - the launch documentation set and the CI workflow exist
 *   - the launch checklist still covers every required launch topic
 *   - production docs contain placeholders only, never secret-shaped values
 *
 * Topic checks match a section heading by keyword (renumber-tolerant) OR a
 * stable content marker, so renumbering or renaming checklist sections stays
 * green. A failure means a topic actually disappeared from the docs - treat
 * it as signal, not noise.
 *
 * Exit code: 0 when all checks pass, 1 otherwise.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
);

const REQUIRED_FILES = [
  "docs/DEPLOYMENT.md",
  "docs/BETA_READINESS.md",
  "docs/LAUNCH_CHECKLIST.md",
  "docs/launch-evidence/environments.md",
  "docs/legal/launch-policy-review.md",
  "vercel.json",
  "docs/PRODUCTION_ENV_VARS.md",
  "docs/OPERATIONAL_HEALTH.md",
  "docs/LOCAL_SUPABASE.md",
  ".github/workflows/ci.yml",
];

const REQUIRED_ENV_VAR_NAMES = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RATE_LIMIT_HMAC_SECRET",
];

// Operational runbooks whose CURRENT "N migrations" counts must track the real
// on-disk inventory. Historical, Slice/PR-labeled lines are exempt (see
// checkMigrationInventory) so accurate history is preserved.
const MIGRATION_COUNT_DOCS = [
  "docs/DEPLOYMENT.md",
  "docs/LAUNCH_CHECKLIST.md",
  "docs/BETA_READINESS.md",
  "docs/OPERATIONAL_HEALTH.md",
];

// Operational docs must describe real privileged consumers without confusing
// trusted workers with ordinary caller-authenticated business mutations.
const SERVICE_ROLE_DOCS = [
  "docs/DEPLOYMENT.md",
  "docs/LAUNCH_CHECKLIST.md",
  "docs/BETA_READINESS.md",
  "docs/PRODUCTION_ENV_VARS.md",
  "docs/OPERATIONAL_HEALTH.md",
  "docs/LOCAL_SUPABASE.md",
];

// Match the obsolete global claim, not scoped descriptions of user flows.
const SERVICE_ROLE_NO_CONSUMER_RE =
  /no app code path\s+(?:currently\s+)?uses\s+(?:the\s+service[-\s]role\s+client|it)\b/i;

// A line is treated as historical (exempt from migration count-sync) when it
// carries a Slice/PR marker — e.g. "Slice 24 ... 10 migrations".
const HISTORICAL_MARKER_RE = /\bslice\s+\d+|\bpr\s*#?\d+/i;
const MIGRATIONS_COUNT_RE = /\b(\d+)\s+migrations\b/i;

// Launch topics the checklist must keep covering. Each topic passes when ANY
// of its patterns matches: a keyword heading (section numbers are \d+, so
// renumbering never breaks it) or a stable content marker.
const CHECKLIST_TOPICS = [
  {
    topic: "environment variables",
    anyOf: [/^##\s*\d+\.\s*environment variables/im, /NEXT_PUBLIC_SUPABASE_URL/],
  },
  {
    topic: "migrations",
    anyOf: [/^##\s*\d+\..*migrations/im, /supabase db push/],
  },
  {
    topic: "seed/demo-data verification",
    anyOf: [/^##\s*\d+\.\s*seed/im, /employer%@example\.com/],
  },
  {
    topic: "admin setup",
    anyOf: [/^##\s*\d+\.\s*admin setup/im, /role\s*=\s*'admin'/],
  },
  {
    topic: "RLS / access checks",
    anyOf: [/^##\s*\d+\.\s*rls/im, /\bRLS\b/],
  },
  {
    topic: "rollback",
    anyOf: [/^##\s*\d+\.\s*rollback/im, /rollback/i],
  },
];

// Secret-shaped values that must never appear in docs. Superset of the
// patterns in tests/security.test.ts, each requiring a realistic tail so the
// documented placeholders (sk_live_..., whsec_..., <anon-public-key>) pass.
const SECRET_PATTERNS = [
  { name: "stripe live secret key", re: /sk_live_[0-9a-zA-Z]{16,}/ },
  { name: "stripe test secret key", re: /sk_test_[0-9a-zA-Z]{16,}/ },
  { name: "stripe webhook secret", re: /whsec_[0-9a-zA-Z]{16,}/ },
  { name: "aws access key", re: /AKIA[0-9A-Z]{16}/ },
  {
    name: "private key block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "jwt-shaped token",
    re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: "connection string with password",
    re: /postgres(?:ql)?:\/\/[^\s:@]+:[A-Za-z0-9_-]{8,}@/,
  },
];

function tryRead(relPath) {
  const absPath = join(root, relPath);
  if (!existsSync(absPath) || !statSync(absPath).isFile()) return null;
  return readFileSync(absPath, "utf8");
}

function checkRequiredFilesExist() {
  return REQUIRED_FILES.filter((file) => tryRead(file) === null).map(
    (file) => `missing required file: ${file}`,
  );
}

function checkChecklistTopics() {
  const checklist = tryRead("docs/LAUNCH_CHECKLIST.md");
  if (checklist === null) {
    return ["docs/LAUNCH_CHECKLIST.md is missing (see required-files check)"];
  }
  return CHECKLIST_TOPICS.filter(
    ({ anyOf }) => !anyOf.some((re) => re.test(checklist)),
  ).map(({ topic }) => `launch checklist no longer covers: ${topic}`);
}

function checkCurrentMigrations() {
  const dir = join(root, "supabase/migrations");
  if (!existsSync(dir)) return ["missing current migration directory"];
  const files = readdirSync(dir).filter(name => name.endsWith(".sql")).sort();
  if (!files.length || files.some(name => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name))) return ["invalid current migration filenames"];
  if (new Set(files.map(name => name.slice(0,14))).size !== files.length) return ["duplicate migration history version"];
  return [];
}

function checkNativeReleaseBuild() {
  const config = tryRead("vercel.json");
  return config && JSON.parse(config).buildCommand === "npm run build:release" ? [] : ["Vercel native release build command missing"];
}

function checkEnvVarReference() {
  const reference = tryRead("docs/PRODUCTION_ENV_VARS.md");
  if (reference === null) {
    return ["docs/PRODUCTION_ENV_VARS.md is missing (see required-files check)"];
  }
  const failures = REQUIRED_ENV_VAR_NAMES.filter(
    (name) => !reference.includes(name),
  ).map((name) => `env var reference does not mention: ${name}`);
  if (!/server-only/i.test(reference)) {
    failures.push("env var reference does not mark server-only variables");
  }
  if (!/placeholder/i.test(reference)) {
    failures.push("env var reference does not state the placeholder policy");
  }
  return failures;
}

function checkNoSecretsInDocs() {
  const docsDir = join(root, "docs");
  if (!existsSync(docsDir)) return ["docs/ directory missing"];
  const files = readdirSync(docsDir, { recursive: true })
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name));
  for (const extra of ["README.md", ".env.example"]) {
    if (existsSync(join(root, extra))) files.push(extra);
  }
  const failures = [];
  for (const file of files) {
    const content = tryRead(file);
    if (content === null) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(content)) {
        failures.push(`${file}: contains a value shaped like a ${name}`);
      }
    }
  }
  return failures;
}

function checkNpmScriptWiring() {
  const raw = tryRead("package.json");
  if (raw === null) return ["package.json is missing"];
  const scripts = JSON.parse(raw).scripts ?? {};
  const command = scripts["verify:beta"];
  if (typeof command !== "string" || !command.includes("verify-beta-readiness.mjs")) {
    return ['package.json is missing the "verify:beta" script'];
  }
  return [];
}

function listMigrationSqlNames() {
  const dir = join(root, "supabase", "migrations");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

// Inventory-driven, renumbering-tolerant migration check. The count is derived
// from disk (never hard-coded): DEPLOYMENT.md's order table must name every
// migration file, and any current "N migrations" claim in the runbooks must
// match that count.
function checkMigrationInventory() {
  const migrations = listMigrationSqlNames();
  if (migrations === null) return ["supabase/migrations/ directory is missing"];
  if (migrations.length === 0) {
    return ["supabase/migrations/ contains no .sql migration files"];
  }
  const failures = [];

  const deployment = tryRead("docs/DEPLOYMENT.md");
  if (deployment === null) {
    failures.push("docs/DEPLOYMENT.md is missing (see required-files check)");
  } else {
    for (const file of migrations) {
      if (!deployment.includes(file)) {
        failures.push(`docs/DEPLOYMENT.md does not document migration: ${file}`);
      }
    }
  }

  const expected = migrations.length;
  for (const doc of MIGRATION_COUNT_DOCS) {
    const content = tryRead(doc);
    if (content === null) continue;
    for (const line of content.split("\n")) {
      if (HISTORICAL_MARKER_RE.test(line)) continue; // labeled history — preserve
      const match = line.match(MIGRATIONS_COUNT_RE);
      if (match && Number(match[1]) !== expected) {
        failures.push(
          `${doc}: current claim of ${match[1]} migrations does not match the ${expected} on disk`,
        );
      }
    }
  }
  return failures;
}

// Launch notification workers use the service role; the optional local OTP
// limiter is a separate retained consumer. Fail obsolete global claims and
// require the active notification boundary to be documented.
function checkServiceRoleConsumerClaim() {
  const failures = [];
  for (const doc of SERVICE_ROLE_DOCS) {
    const content = tryRead(doc);
    if (content === null) continue;
    if (SERVICE_ROLE_NO_CONSUMER_RE.test(content)) {
      failures.push(
        `${doc}: stale claim that no app code path uses the service-role client (trusted notification workers use it)`,
      );
    }
  }
  const documentsConsumer = SERVICE_ROLE_DOCS.some((doc) => {
    const content = tryRead(doc);
    return content !== null && content.includes("notification_outbox");
  });
  if (!documentsConsumer) {
    failures.push(
      "no operational doc documents the trusted notification service-role consumer (notification_outbox)",
    );
  }
  return failures;
}

const checks = [
  { name: "required files exist", run: checkRequiredFilesExist },
  { name: "launch checklist covers required topics", run: checkChecklistTopics },
  { name: "current migration history names", run: checkCurrentMigrations },
  { name: "native Vercel release build", run: checkNativeReleaseBuild },
  { name: "env var reference completeness", run: checkEnvVarReference },
  { name: "migration inventory documented", run: checkMigrationInventory },
  { name: "service-role consumer documented", run: checkServiceRoleConsumerClaim },
  { name: "no secret-shaped values in docs", run: checkNoSecretsInDocs },
  { name: "npm script wiring", run: checkNpmScriptWiring },
];

console.log("K-Work US - California launch verification (offline docs gate; not hosted readiness)");
console.log(`root: ${root}`);
console.log("");

let failedChecks = 0;
for (const { name, run } of checks) {
  let failures;
  try {
    failures = run();
  } catch (error) {
    failures = [`unexpected error: ${error instanceof Error ? error.message : error}`];
  }
  if (failures.length === 0) {
    console.log(`PASS  ${name}`);
  } else {
    failedChecks += 1;
    console.error(`FAIL  ${name}`);
    for (const failure of failures) {
      console.error(`      - ${failure}`);
    }
  }
}

console.log("");
console.log(`Summary: ${checks.length - failedChecks}/${checks.length} checks passed`);
console.log(`RESULT: ${failedChecks === 0 ? "PASS" : "FAIL"}`);
process.exit(failedChecks === 0 ? 0 : 1);
