#!/usr/bin/env node
/**
 * verify-rate-limit-concurrency.mjs — live concurrency proof for the durable
 * rate limiter (Slice 28), complementing the sequential SQL proof in
 * supabase/tests/slice-28-rate-limiting.sql.
 *
 * Fires MORE parallel `consume_rate_limit` RPC calls than the configured limit
 * against a fresh, unique (scope, subject_hash) and asserts the atomic counter
 * lets exactly N through — no race lets an extra call slip past the limit.
 *
 * DISPOSABLE LOCAL STACK ONLY. It refuses to run unless the target URL is
 * localhost/127.0.0.1. Provide the local stack's URL + service_role key, e.g.:
 *
 *   export $(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')
 *   npm run verify:rate-limit
 *
 * Prints only counts and PASS/FAIL — never the service-role key, an IP, a phone
 * number, a user id, or any HMAC value. Exit code: 0 on success, 1 on any race,
 * malformed response, or misconfiguration.
 */
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 20;
const PARALLEL = 30; // > MAX_ATTEMPTS so the excess must be denied
const WINDOW_SECONDS = 900;

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

const url =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.API_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  fail(
    "missing local stack env. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY " +
      "(or API_URL + SERVICE_ROLE_KEY from `supabase status -o env`).",
  );
}

// Local-only guard: never hammer a hosted project.
let host;
try {
  host = new URL(url).hostname;
} catch {
  fail("SUPABASE_URL is not a valid URL");
}
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
if (!LOCAL_HOSTS.has(host)) {
  fail(
    `refusing to run against a non-local host (${host}). This script is for a ` +
      "disposable local Supabase stack only.",
  );
}

console.log("K-Work US - rate limiter concurrency proof (local stack)");
console.log(`target: ${host}  |  limit: ${MAX_ATTEMPTS}  |  parallel: ${PARALLEL}`);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique per run so the run is isolated and repeatable.
const scope = `verify_rate_limit_${randomUUID()}`.slice(0, 100);
const subjectHash = randomBytes(32).toString("hex"); // 64 lowercase hex

function isValidRow(row) {
  return (
    row &&
    typeof row.allowed === "boolean" &&
    Number.isInteger(row.remaining) &&
    row.remaining >= 0 &&
    Number.isInteger(row.retry_after_seconds) &&
    row.retry_after_seconds >= 0
  );
}

async function consumeOnce(i) {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_max_attempts: MAX_ATTEMPTS,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (error) fail(`RPC call ${i} errored (${error.code ?? "?"})`);
  if (!Array.isArray(data) || data.length !== 1 || !isValidRow(data[0])) {
    fail(`RPC call ${i} returned a malformed result`);
  }
  return data[0];
}

async function cleanup() {
  // Best-effort tidy-up of this run's rows (disposable DB either way).
  await supabase.from("rate_limit_buckets").delete().eq("scope", scope);
}

const rounds = Array.from({ length: PARALLEL }, (_, i) => consumeOnce(i));
const results = await Promise.all(rounds);

const allowed = results.filter((r) => r.allowed);
const denied = results.filter((r) => !r.allowed);

let ok = true;
if (allowed.length !== MAX_ATTEMPTS) {
  console.error(
    `FAIL  expected exactly ${MAX_ATTEMPTS} allowed, got ${allowed.length}`,
  );
  ok = false;
}
if (denied.length !== PARALLEL - MAX_ATTEMPTS) {
  console.error(
    `FAIL  expected ${PARALLEL - MAX_ATTEMPTS} denied, got ${denied.length}`,
  );
  ok = false;
}
if (allowed.some((r) => r.retry_after_seconds !== 0)) {
  console.error("FAIL  an allowed call reported a non-zero retry_after_seconds");
  ok = false;
}
if (denied.some((r) => r.retry_after_seconds < 1 || r.retry_after_seconds > WINDOW_SECONDS)) {
  console.error("FAIL  a denied call reported an out-of-range retry_after_seconds");
  ok = false;
}

await cleanup();

if (!ok) {
  console.error("RESULT: FAIL");
  process.exit(1);
}
console.log(`PASS  ${allowed.length} allowed, ${denied.length} denied (no race)`);
console.log("RESULT: PASS");
