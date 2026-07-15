import "server-only";

import { isProductionRuntime } from "@/lib/supabase/config";
import {
  createSupabaseServiceRoleClient,
  isSupabaseServiceRoleConfigured,
} from "@/lib/supabase/service";
import { deriveSubjectHash } from "@/lib/rate-limit/keys";
import type {
  RateLimitOutcome,
  RateLimitPolicy,
  RateLimitStep,
  RateLimitStore,
} from "@/lib/rate-limit/types";

/**
 * Durable rate-limit enforcement (Slice 28).
 *
 * The ONLY application responsibility of the service-role client added in this
 * slice: consuming the private `consume_rate_limit` counter. It never sends/
 * verifies OTPs and never performs a business mutation.
 *
 * Fail policy: in production/preview runtime any limiter unavailability (missing
 * secret, missing service-role config, RPC error, malformed result) DENIES the
 * request. Local dev/test fails open so the app stays usable without the limiter.
 */

/** Generic retry hint used when we deny without a real window (fail-closed). */
const FAILSAFE_RETRY_SECONDS = 60;

/** Fixed log category. We never log the caught error object or any subject. */
function logEvent(event: string): void {
  console.warn(`[rate-limit] ${event}`);
}

function deny(retryAfterSeconds = FAILSAFE_RETRY_SECONDS): RateLimitOutcome {
  return { allowed: false, remaining: 0, retryAfterSeconds };
}

/** Synthetic allow for fail-open / empty-step paths (no real counter consulted). */
function allowOpen(): RateLimitOutcome {
  return {
    allowed: true,
    remaining: Number.MAX_SAFE_INTEGER,
    retryAfterSeconds: 0,
  };
}

/** Deny in production/preview, allow in local dev/test. Never logs error objects. */
function unavailable(reason: string): RateLimitOutcome {
  if (isProductionRuntime()) {
    logEvent(`fail-closed: ${reason}`);
    return deny();
  }
  logEvent(`fail-open (non-production): ${reason}`);
  return allowOpen();
}

/**
 * Validate the RPC payload shape in TS rather than trusting arbitrary Supabase
 * response data. `consume_rate_limit` returns exactly one row; anything else
 * (empty, multiple rows, wrong types, negative/out-of-range values) is treated
 * as malformed and throws so the caller fails closed in production.
 */
function parseRpcOutcome(data: unknown): RateLimitOutcome {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("malformed_result");
  }
  const row = data[0] as Record<string, unknown>;
  const { allowed, remaining, retry_after_seconds: retry } = row;
  if (
    typeof allowed !== "boolean" ||
    typeof remaining !== "number" ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    typeof retry !== "number" ||
    !Number.isInteger(retry) ||
    retry < 0
  ) {
    throw new Error("malformed_result");
  }
  return { allowed, remaining, retryAfterSeconds: retry };
}

/** Default store: the service-role RPC. Constructed lazily inside `consume`. */
function defaultStore(): RateLimitStore {
  return {
    async consume(scope, subjectHash, maxAttempts, windowSeconds) {
      const supabase = createSupabaseServiceRoleClient();
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_scope: scope,
        p_subject_hash: subjectHash,
        p_max_attempts: maxAttempts,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error("rpc_error");
      return parseRpcOutcome(data);
    },
  };
}

/**
 * Consume the given (policy, subject) steps SEQUENTIALLY, stopping at the FIRST
 * denial — so a denied coarse bucket never lets later, finer buckets accrue rows.
 * Returns the denying step's own clamped outcome, or the last allowed outcome
 * when every step passes.
 *
 * A denied step still increments its bucket atomically inside the DB function;
 * steps AFTER the denial are not consumed at all.
 */
export async function enforcePolicies(
  steps: readonly RateLimitStep[],
  store: RateLimitStore = defaultStore(),
): Promise<RateLimitOutcome> {
  if (!isSupabaseServiceRoleConfigured()) {
    return unavailable("service_role_unconfigured");
  }

  let last = allowOpen();
  for (const step of steps) {
    const subjectHash = deriveSubjectHash(step.domain, step.value);
    if (subjectHash === null) {
      return unavailable("hmac_secret_missing_or_invalid");
    }

    let outcome: RateLimitOutcome;
    try {
      outcome = await store.consume(
        step.policy.scope,
        subjectHash,
        step.policy.maxAttempts,
        step.policy.windowSeconds,
      );
    } catch {
      return unavailable("consume_failed");
    }

    if (!outcome.allowed) return outcome; // short-circuit: do not consume the rest
    last = outcome;
  }
  return last;
}

/**
 * Convenience for the authenticated write actions: consume a single per-user
 * bucket. The `user.id` is HMAC-hashed with the `user` domain before it reaches
 * the DB.
 */
export async function enforceUserPolicy(
  policy: RateLimitPolicy,
  userId: string,
  store?: RateLimitStore,
): Promise<RateLimitOutcome> {
  return enforcePolicies([{ policy, domain: "user", value: userId }], store);
}
