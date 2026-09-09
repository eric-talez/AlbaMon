import nextEnv from "@next/env";
import { isIP } from "node:net";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), false);

const required = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
];

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value || /your-project|your-anon-key|example\.com/.test(value)) {
    throw new Error(`Missing release setting: ${name}`);
  }
}

const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL);
const hostname = origin.hostname.replace(/\.$/, "");
const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
if (
  origin.protocol !== "https:" ||
  !hostname.includes(".") ||
  hostname === "localhost" ||
  hostname.endsWith(".localhost") ||
  isIP(address) !== 0
) {
  throw new Error("Release requires a public HTTPS origin");
}

if (process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true") {
  throw new Error("Release requires tested Google authentication");
}

console.log("Release environment settings are present.");
