import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSupabaseServiceRoleConfigured } from "@/lib/supabase/service";
import {
  getStripePriceId,
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "@/lib/payments/config";

/**
 * Operational health report for the private beta, served by `GET /api/health`.
 *
 * Safety contract — the endpoint is public and unauthenticated, so this module
 * must uphold all of the following (asserted by `tests/health.test.ts`):
 *
 * - Reports coarse statuses only. Never env values, key fragments, hostnames,
 *   or error details.
 * - Presence-of-configuration checks only: reads `process.env` through the
 *   same predicates the app itself uses. No Supabase/Stripe/network calls,
 *   no database access, no writes.
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
  stripe: HealthCheckStatus;
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

/** Anon (auth) credentials plus the server-only service-role key used by the
 * Stripe webhook. Placeholder values from `.env.example` count as missing. */
function checkSupabase(): HealthCheckStatus {
  const present = [isSupabaseConfigured(), isSupabaseServiceRoleConfigured()];
  if (present.every(Boolean)) return "configured";
  if (present.some(Boolean)) return "partial";
  return "missing";
}

/** Secret key, webhook signing secret, and both boost price ids. */
function checkStripe(): HealthCheckStatus {
  const present = [
    getStripeSecretKey() !== null,
    getStripeWebhookSecret() !== null,
    getStripePriceId("featured") !== null,
    getStripePriceId("urgent") !== null,
  ];
  if (present.every(Boolean)) return "configured";
  if (present.some(Boolean)) return "partial";
  return "missing";
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
      stripe: checkStripe(),
      email: checkEmail(),
      analytics: checkAnalytics(),
    },
  };
}
