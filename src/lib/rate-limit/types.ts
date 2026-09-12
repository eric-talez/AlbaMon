/**
 * Shared, pure types for the durable rate limiter (Slice 28).
 *
 * No `server-only` import, no secret/environment access — safe to import from
 * anywhere, including the client `FormState` unions that surface a throttle.
 */

/** A fixed-window policy: allow `maxAttempts` per `windowSeconds` for a `scope`. */
export interface RateLimitPolicy {
  /** Stable bucket namespace persisted in the DB (e.g. "otp_send_ip"). */
  readonly scope: string;
  readonly maxAttempts: number;
  readonly windowSeconds: number;
}

/** Domain-separation prefix mixed into the HMAC subject value. */
export type SubjectDomain = "phone" | "ip" | "user" | "thread";

/** Outcome of consuming one or more buckets. */
export interface RateLimitOutcome {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/** A single (policy, subject) consumption step. */
export interface RateLimitStep {
  readonly policy: RateLimitPolicy;
  readonly domain: SubjectDomain;
  readonly value: string;
}

/**
 * Injection seam for the DB call. The default implementation invokes the
 * service-role RPC; tests inject a deterministic fake so no hosted service is
 * required.
 */
export interface RateLimitStore {
  consume(
    scope: string,
    subjectHash: string,
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<RateLimitOutcome>;
}

/**
 * Stable result branch merged into each protected action's client `FormState`
 * union when a request is throttled. `retryAfterSeconds` is a UI hint only.
 */
export interface RateLimitedResult {
  readonly status: "rate_limited";
  readonly retryAfterSeconds: number;
  readonly message: string;
}

/** Fixed, PII-free bilingual copy shown when a request is rate limited. */
export const RATE_LIMITED_MESSAGE =
  "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요. (Too many attempts. Please try again shortly.)";

/** Build the shared `rate_limited` result from a limiter outcome's retry hint. */
export function rateLimitedResult(retryAfterSeconds: number): RateLimitedResult {
  return {
    status: "rate_limited",
    retryAfterSeconds,
    message: RATE_LIMITED_MESSAGE,
  };
}
