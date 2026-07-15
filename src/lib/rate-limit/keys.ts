import "server-only";

import { computeSubjectHash, parseHmacSecret } from "@/lib/rate-limit/key-core";
import type { SubjectDomain } from "@/lib/rate-limit/types";

/**
 * Server-only HMAC key access for the rate limiter (Slice 28).
 *
 * The secret is read and validated at CALL time, never at import — a missing or
 * placeholder secret must not crash the build. Never log the secret value or a
 * derived hash.
 *
 * Rotating RATE_LIMIT_HMAC_SECRET starts a NEW key namespace: existing bucket
 * rows become unreachable by newly-derived hashes and disappear through the
 * limiter's normal expired-row cleanup. This is a safe, bounded reset — it does
 * not delete or migrate old counters, it just stops addressing them.
 */
function loadKey(): Buffer | null {
  return parseHmacSecret(process.env.RATE_LIMIT_HMAC_SECRET);
}

/** True only when a valid 64-hex → 32-byte secret is configured. */
export function hmacConfigured(): boolean {
  return loadKey() !== null;
}

/**
 * Derive the opaque subject hash for a (domain, value), or `null` when the secret
 * is missing/invalid. Callers translate `null` into a fail-closed denial in
 * production (see `src/lib/rate-limit/service.ts`).
 */
export function deriveSubjectHash(
  domain: SubjectDomain,
  value: string,
): string | null {
  const key = loadKey();
  if (key === null) return null;
  return computeSubjectHash(key, domain, value);
}
