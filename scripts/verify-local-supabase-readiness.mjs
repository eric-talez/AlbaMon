#!/usr/bin/env node
/**
 * verify-local-supabase-readiness.mjs - offline gate for the local Supabase
 * developer path (docs/LOCAL_SUPABASE.md).
 *
 * Usage:
 *   npm run verify:local-supabase
 *   node scripts/verify-local-supabase-readiness.mjs [repo-root]
 *
 * Read-only and self-contained: no network, no Docker, no Supabase CLI, no
 * database connections, no writes. It never reads `.env.local` (or any other
 * untracked env file) and never prints file contents — failures name the file
 * and the pattern, not the matched value. It verifies repo-level assumptions
 * only:
 *
 *   - the local-stack inputs exist (config.toml, migrations/, seed.sql)
 *   - `.env.example` still ships placeholder Supabase values and default-off
 *     auth provider flags
 *   - docs/LOCAL_SUPABASE.md exists and still covers the local smoke topics
 *   - the guide is cross-linked from the README and the readiness/launch docs
 *   - no secret-shaped value or hosted Supabase project ref is committed to
 *     the scanned docs/config surface
 *
 * Topic checks match a section heading by keyword (renumber-tolerant) OR a
 * stable content marker, so renumbering or renaming guide sections stays
 * green. A failure means a topic actually disappeared - treat it as signal.
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
  "supabase/config.toml",
  "supabase/seed.sql",
  "docs/LOCAL_SUPABASE.md",
  ".env.example",
];

/** Docs that must point developers at the local Supabase guide. */
const CROSS_LINKED_DOCS = [
  "README.md",
  "docs/BETA_READINESS.md",
  "docs/LAUNCH_CHECKLIST.md",
  "docs/AUTH_PROVIDERS.md",
  "supabase/README.md",
];

// Topics docs/LOCAL_SUPABASE.md must keep covering. Each topic passes when
// ANY of its patterns matches (keyword headings use \d+ for the section
// number, so renumbering never breaks them).
const GUIDE_TOPICS = [
  { topic: "Supabase CLI install command", anyOf: [/brew install supabase\/tap\/supabase/] },
  { topic: "starting the local stack", anyOf: [/supabase start/] },
  { topic: "migrations + seed via db reset", anyOf: [/supabase db reset/] },
  { topic: "wiring keys into .env.local", anyOf: [/\.env\.local/] },
  { topic: "health check verification", anyOf: [/\/api\/health/] },
  { topic: "public jobs verification", anyOf: [/localhost:3000\/jobs/] },
  { topic: "login/signup verification", anyOf: [/localhost:3000\/login/] },
  {
    topic: "admin promotion via SQL",
    anyOf: [/^##\s*\d+\.\s*verifying admin promotion/im, /role\s*=\s*'admin'/],
  },
  {
    topic: "resetting the local DB",
    anyOf: [/^##\s*\d+\.\s*resetting/im, /supabase stop/],
  },
  {
    topic: "local vs hosted differences",
    anyOf: [/^##\s*\d+\.\s*local supabase vs hosted/im, /hosted supabase/i],
  },
  {
    topic: "what not to commit",
    anyOf: [/^##\s*\d+\.\s*what not to commit/im, /never commit/i],
  },
  { topic: "manual smoke checklist", anyOf: [/smoke checklist/i] },
];

// Secret-shaped values that must never be committed to the scanned files.
// Mirrors scripts/verify-beta-readiness.mjs, plus a hosted Supabase project
// ref (a long random hostname label — the tracked placeholder
// `your-project.supabase.co` stays green).
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
    name: "jwt-shaped token (e.g. a Supabase anon/service_role key)",
    re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    name: "connection string with password",
    re: /postgres(?:ql)?:\/\/[^\s:@]+:[A-Za-z0-9_-]{8,}@/,
  },
  {
    name: "hosted supabase project ref",
    re: /[a-z0-9]{16,}\.supabase\.co/,
  },
  {
    // A real RATE_LIMIT_HMAC_SECRET is exactly 64 hex chars. Anchored to the var
    // name so example subject-hash values in docs don't trip it; the shipped
    // non-hex placeholder (generate-with-openssl-rand-hex-32) stays green.
    name: "committed rate-limit HMAC secret",
    re: /RATE_LIMIT_HMAC_SECRET\s*=\s*["']?[0-9a-fA-F]{64}\b/,
  },
];

function tryRead(relPath) {
  const absPath = join(root, relPath);
  if (!existsSync(absPath) || !statSync(absPath).isFile()) return null;
  return readFileSync(absPath, "utf8");
}

function checkRequiredFilesExist() {
  const failures = REQUIRED_FILES.filter((file) => tryRead(file) === null).map(
    (file) => `missing required file: ${file}`,
  );
  const migrationsDir = join(root, "supabase", "migrations");
  if (!existsSync(migrationsDir) || !statSync(migrationsDir).isDirectory()) {
    failures.push("missing required directory: supabase/migrations");
  } else if (
    !readdirSync(migrationsDir).some((name) => name.endsWith(".sql"))
  ) {
    failures.push("supabase/migrations contains no .sql migration files");
  }
  return failures;
}

function checkSupabaseConfig() {
  const config = tryRead("supabase/config.toml");
  if (config === null) {
    return ["supabase/config.toml is missing (see required-files check)"];
  }
  const failures = [];
  if (!/^project_id\s*=/m.test(config)) {
    failures.push("supabase/config.toml lost its project_id");
  }
  if (!/^\[db\.seed\]/m.test(config) || !/seed\.sql/.test(config)) {
    failures.push(
      "supabase/config.toml no longer wires seed.sql via [db.seed]",
    );
  }
  // The docs/LOCAL_SUPABASE.md appendix describes a LOCAL-ONLY test_otp edit;
  // committing it would ship a fixed sign-in code to every checkout.
  if (/test_otp/.test(config)) {
    failures.push(
      "supabase/config.toml commits a test_otp block (local-only edit — revert it)",
    );
  }
  return failures;
}

function checkEnvExamplePlaceholders() {
  const example = tryRead(".env.example");
  if (example === null) {
    return [".env.example is missing (see required-files check)"];
  }
  const failures = [];
  const placeholders = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", fragment: "your-project" },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", fragment: "your-anon-key" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", fragment: "your-service-role-key" },
    {
      name: "RATE_LIMIT_HMAC_SECRET",
      fragment: "generate-with-openssl-rand-hex-32",
    },
  ];
  for (const { name, fragment } of placeholders) {
    const line = example
      .split("\n")
      .find((candidate) => candidate.startsWith(`${name}=`));
    if (!line) {
      failures.push(`.env.example is missing the ${name} placeholder line`);
    } else if (!line.includes(fragment)) {
      failures.push(
        `.env.example ${name} no longer looks like the "${fragment}" placeholder`,
      );
    }
  }
  const flagLines = example
    .split("\n")
    .filter((line) => /^NEXT_PUBLIC_AUTH_[A-Z_]*_ENABLED=/.test(line));
  if (flagLines.length === 0) {
    failures.push(".env.example lost the NEXT_PUBLIC_AUTH_*_ENABLED flags");
  }
  for (const line of flagLines) {
    if (!line.trim().endsWith("=false")) {
      failures.push(
        `.env.example auth provider flag is not default-off: ${line.split("=")[0]}`,
      );
    }
  }
  return failures;
}

function checkGuideTopics() {
  const guide = tryRead("docs/LOCAL_SUPABASE.md");
  if (guide === null) {
    return ["docs/LOCAL_SUPABASE.md is missing (see required-files check)"];
  }
  return GUIDE_TOPICS.filter(
    ({ anyOf }) => !anyOf.some((re) => re.test(guide)),
  ).map(({ topic }) => `local Supabase guide no longer covers: ${topic}`);
}

function checkDocCrossLinks() {
  const failures = [];
  for (const file of CROSS_LINKED_DOCS) {
    const content = tryRead(file);
    if (content === null) {
      failures.push(`missing cross-linked doc: ${file}`);
    } else if (!content.includes("LOCAL_SUPABASE")) {
      failures.push(`${file} does not reference the local Supabase guide`);
    }
  }
  return failures;
}

function checkNoSecretShapedValues() {
  const docsDir = join(root, "docs");
  if (!existsSync(docsDir)) return ["docs/ directory missing"];
  const files = readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join("docs", name));
  for (const extra of ["README.md", ".env.example", "supabase/config.toml"]) {
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
  const command = scripts["verify:local-supabase"];
  if (
    typeof command !== "string" ||
    !command.includes("verify-local-supabase-readiness.mjs")
  ) {
    return ['package.json is missing the "verify:local-supabase" script'];
  }
  return [];
}

const checks = [
  { name: "local stack inputs exist", run: checkRequiredFilesExist },
  { name: "supabase config.toml sanity", run: checkSupabaseConfig },
  { name: ".env.example placeholders intact", run: checkEnvExamplePlaceholders },
  { name: "local guide covers required topics", run: checkGuideTopics },
  { name: "guide is cross-linked from docs", run: checkDocCrossLinks },
  { name: "no secret-shaped or hosted values committed", run: checkNoSecretShapedValues },
  { name: "npm script wiring", run: checkNpmScriptWiring },
];

console.log(
  "K-Work US - local Supabase readiness verification (offline gate)",
);
console.log(`root: ${root}`);
console.log("");

let failedChecks = 0;
for (const { name, run } of checks) {
  let failures;
  try {
    failures = run();
  } catch (error) {
    failures = [
      `unexpected error: ${error instanceof Error ? error.message : error}`,
    ];
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
console.log(
  `Summary: ${checks.length - failedChecks}/${checks.length} checks passed`,
);
console.log(`RESULT: ${failedChecks === 0 ? "PASS" : "FAIL"}`);
process.exit(failedChecks === 0 ? 0 : 1);
