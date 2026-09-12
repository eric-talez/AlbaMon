import "server-only";

import { emailDeliveryConfigured } from "@/lib/notifications/email";
import { createClient } from "@supabase/supabase-js";
import {
  getSupabasePublicConfig,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { isSupabaseServiceRoleConfigured } from "@/lib/supabase/service";
import { isPhoneAuthEnabled } from "@/lib/auth/providers";
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
  /** Disabled/unselected integrations (email dev mode, analytics). */
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

/** Auth credentials plus the service-role key reserved for notification workers,
 * verified webhooks, and controlled operations in the public launch. */
function checkSupabase(): HealthCheckStatus {
  const present = [isSupabaseConfigured(), isSupabaseServiceRoleConfigured()];
  if (present.every(Boolean)) return "configured";
  if (present.some(Boolean)) return "partial";
  return "missing";
}

/** The private counter is optional while OTP is development-only. Authenticated
 * launch writes use the database's actor quotas, without this HMAC secret. */
function checkRateLimit(): HealthCheckStatus {
  if (!isPhoneAuthEnabled()) return "deferred";
  return hmacConfigured() ? "configured" : "missing";
}

/** A key alone is partial. Configured means the delivery path is enabled with
 * worker/webhook settings; it does not claim DNS or inbox delivery was verified. */
function checkEmail(): HealthCheckStatus {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!provider || provider === "dev") return "deferred";
  return emailDeliveryConfigured() && isSupabaseServiceRoleConfigured() ? "configured" : "partial";
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

/** Cookie-free public DB read used by the readiness endpoint. */
export async function checkReadiness(
  fetchImplementation: typeof fetch = fetch,
): Promise<boolean> {
  const config = getSupabasePublicConfig();
  if (!config) return false;

  try {
    const supabase = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { fetch: fetchImplementation },
    });
    const result = await supabase
      .from("public_job_listings")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(2_000));
    return !result.error;
  } catch {
    return false;
  }
}
