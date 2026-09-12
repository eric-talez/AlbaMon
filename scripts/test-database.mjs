#!/usr/bin/env node
// Explicit runners: database/ contains pgTAP; slice files use psql exceptions.
// This command never starts, migrates, resets, or seeds a database.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const config = readFileSync("supabase/config.toml", "utf8");
const databaseSection = config.match(/^\[db\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
const configuredPort = databaseSection?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1];
if (!configuredPort) fail("Cannot identify the configured local database port.");

const status = spawnSync("supabase", ["status", "--output", "json"], {
  encoding: "utf8",
});
if (status.error || status.status !== 0) fail("The configured local Supabase stack is unavailable.");
let dbUrl;
try {
  dbUrl = new URL(JSON.parse(status.stdout).DB_URL);
} catch {
  fail("Local Supabase status did not return a database URL.");
}
if (!["postgres", "postgresql"].includes(dbUrl.protocol.slice(0, -1)) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(dbUrl.hostname) ||
    dbUrl.port !== configuredPort) {
  fail("Refusing database tests: target does not match the configured local database.");
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error || result.status !== 0) fail(`${command} database checks failed.`);
}

run("supabase", ["test", "db", "--local", "supabase/tests/database"]);
for (const file of [
  "slice-25-company-read-restriction.sql",
  "slice-27-admin-audit-writes.sql",
  "slice-28-rate-limiting.sql",
  "slice-31-expired-job-visibility.sql",
]) {
  // Environment keeps local credentials out of process arguments and logs.
  run("psql", ["--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", `supabase/tests/${file}`], {
    ...process.env,
    PGHOST: dbUrl.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: dbUrl.port,
    PGDATABASE: decodeURIComponent(dbUrl.pathname.slice(1)),
    PGUSER: decodeURIComponent(dbUrl.username),
    PGPASSWORD: decodeURIComponent(dbUrl.password),
  });
}
