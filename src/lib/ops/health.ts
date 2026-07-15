import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSupabaseServiceRoleConfigured } from "@/lib/supabase/service";
import { hmacConfigured } from "@/lib/rate-limit/keys";

/**
 * Operational health report for the private beta, served by `GET /api/health`.
 *
 * Safety contract — the endpoint is public and unauthenticated, so this module
 * must uphold all of the following (asserted by `tests/health.test.ts`):
 *
 * - Reports coarse statuses only. Never env values, key fragments, hostnames,
 *   or error details.
 * - Presence-of-configuration checks only: reads `process.env` through the
 *   same predicates the app itself uses. No Supabase/network calls, no
 *   database access, no writes.
 * - Never throws — the endpoint backs public uptime checks and must answer
 *   even in a fully unconfigured (CI/dev) process.
 */

export type HealthCheckStatus =
  /** Everything this check covers is present (placeholders don't count). */
  | "configured"
  /** Some but not all of the values this check covers are present. */
  | "partial"
  /** None of the values this check covers are present. */
  | "missing"
  /** Deliberately not wired for the beta (email provider, analytics). */
  | "deferred";

export interface HealthChecks {
  siteUrl: HealthCheckStatus;
  supabase: HealthCheckStatus;
  rateLimit: HealthCheckStatus;
  email: HealthCheckStatus;
  analytics: HealthCheckStatus;
}

export interface HealthReport {
  /** "ok" whenever the process can serve the request at all. */
  status: "ok";
  service: "k-work-us";
  /** ISO-8601 response time, so operators can spot cached/stale responses. */
  timestamp: string;
  checks: HealthChecks;
}

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** `NEXT_PUBLIC_SITE_URL` present and parseable. Localhost counts as
 * configured here — whether the value is *correct* for the environment is a
 * launch-checklist concern, not a liveness concern. */
function checkSiteUrl(): HealthCheckStatus {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "missing";
  try {
    new URL(raw);
    return "configured";
  } catch {
    return "missing";
  }
}

/** Anon (auth) credentials plus the server-only service-role key — the latter
 * is used by the Slice 28 durable rate limiter to reach its private
 * `consume_rate_limit` counter (never for OTP or business writes). Placeholder
 * values from `.env.example` count as missing. */
function checkSupabase(): HealthCheckStatus {
  const present = [isSupabaseConfigured(), isSupabaseServiceRoleConfigured()];
  if (present.every(Boolean)) return "configured";
  if (present.some(Boolean)) return "partial";
  return "missing";
}

/** The durable rate limiter's HMAC secret (`RATE_LIMIT_HMAC_SECRET`). Reports
 * only whether the secret passes the limiter's own 64-hex validation via the
 * shared `hmacConfigured()` predicate — kept separate from Supabase because a
 * missing/placeholder secret makes protected actions fail closed in
 * production/preview even when Supabase is fully configured. */
function checkRateLimit(): HealthCheckStatus {
  return hmacConfigured() ? "configured" : "missing";
}

/** `EMAIL_PROVIDER=dev` (or unset) is the accepted beta state → "deferred".
 * A real provider without its API key is a misconfiguration → "partial". */
function checkEmail(): HealthCheckStatus {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (provider === "resend") {
    return hasValue(process.env.RESEND_API_KEY) ? "configured" : "partial";
  }
  if (provider === "sendgrid") {
    return hasValue(process.env.SENDGRID_API_KEY) ? "configured" : "partial";
  }
  return "deferred";
}

/** Analytics is not initialized in this build; a present key still reports
 * "configured" so operators can see the env is staged for a later slice. */
function checkAnalytics(): HealthCheckStatus {
  return hasValue(process.env.NEXT_PUBLIC_POSTHOG_KEY)
    ? "configured"
    : "deferred";
}

export function buildHealthReport(now: Date = new Date()): HealthReport {
  return {
    status: "ok",
    service: "k-work-us",
    timestamp: now.toISOString(),
    checks: {
      siteUrl: checkSiteUrl(),
      supabase: checkSupabase(),
      rateLimit: checkRateLimit(),
      email: checkEmail(),
      analytics: checkAnalytics(),
    },
  };
}
