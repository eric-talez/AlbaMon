import { validatePolicyPublication, policyFacts, policyAcceptanceIdentity } from "../src/lib/policy-publication.mjs";
import { pathToFileURL } from "node:url";
import { checkDeployTarget } from "./check-deploy-target.mjs";
import { isIP } from "node:net";


export function checkReleaseSettings(env = process.env, facts = policyFacts) {
  const required = [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
    "SUPABASE_SERVICE_ROLE_KEY", "EMAIL_PROVIDER", "EMAIL_NOTIFICATIONS_ENABLED",
    "EMAIL_ENVIRONMENT", "EMAIL_FROM", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "CRON_SECRET",
  ];

  for (const name of required) {
    const value = env[name]?.trim();
    if (!value || /your-project|your-anon-key|your-service-role-key|example\.com/.test(value)) {
      throw new Error(`Missing release setting: ${name}`);
    }
  }

  const origin = new URL(env.NEXT_PUBLIC_SITE_URL);
  const hostname = origin.hostname.replace(/\.$/, "");
  const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  const labels = hostname.split(".");
  const isDnsHostname =
    hostname.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    );
  if (
    origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    !isDnsHostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isIP(address) !== 0
  ) {
    throw new Error("Release requires a public HTTPS origin");
  }

  if (env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") {
    throw new Error("Release requires tested Google authentication");
  }

  if (env.EMAIL_PROVIDER !== "resend" || env.EMAIL_NOTIFICATIONS_ENABLED !== "true" ||
      !["staging", "production"].includes(env.EMAIL_ENVIRONMENT)) {
    throw new Error("Release requires enabled Resend notifications and an explicit email environment");
  }
  if (env.CRON_SECRET.trim().length < 16) throw new Error("CRON_SECRET requires at least 16 characters");
  const mailbox = /^[^\s<>@*,;]+@[^\s<>@*,;]+\.[^\s<>@*,;]+$/;
  const from = env.EMAIL_FROM.trim();
  const fromAddress = from.endsWith(">") ? from.slice(from.lastIndexOf("<") + 1, -1) : from;
  if (!mailbox.test(fromAddress) || /[\r\n]/.test(from)) throw new Error("EMAIL_FROM requires a verified domain mailbox");
  if (env.EMAIL_ENVIRONMENT === "staging") {
    const recipients = (env.EMAIL_STAGING_ALLOWLIST ?? "").split(",").map(value => value.trim());
    if (!recipients.length || recipients.some(value => !mailbox.test(value))) {
      throw new Error("Staging requires exact controlled recipient addresses in EMAIL_STAGING_ALLOWLIST");
    }
  }
  const policyIssues = validatePolicyPublication(facts);
  if (policyIssues.length) throw new Error(`Policy publication blocked: ${policyIssues.join(", ")}`);
  return policyAcceptanceIdentity(facts);
}
export function checkReleaseEnv(env = process.env, facts = policyFacts, databaseIdentity) {
  const identity = checkReleaseSettings(env, facts);
  if (identity !== databaseIdentity) throw new Error("Policy publication blocked: database identity mismatch");
  return identity;
}
// Bounded read-only check, deliberately separate from the pure validator.
export async function readDatabasePolicyIdentity(env = process.env) {
  try {
    const response = await fetch(new URL("/rest/v1/rpc/current_policy_identity", env.NEXT_PUBLIC_SUPABASE_URL), {
      method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(5000), redirect: "error",
    });
    if (!response.ok) throw new Error();
    const identity = await response.json();
    if (typeof identity !== "string" || !/^(draft|reviewed):[0-9a-f]{64}$/.test(identity)) throw new Error();
    return identity;
  } catch { throw new Error("Policy publication blocked: database identity unavailable"); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd(), false);
  try {
    checkReleaseSettings();
    checkDeployTarget(process.env.EMAIL_ENVIRONMENT);
    checkReleaseEnv(process.env, policyFacts, await readDatabasePolicyIdentity());
    console.log("Release settings and database policy identity match; provider/DNS/inbox evidence must be verified separately.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release preflight failed");
    process.exitCode = 1;
  }
}
