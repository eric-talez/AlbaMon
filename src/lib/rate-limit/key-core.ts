/**
 * Pure HMAC key handling for the rate limiter (Slice 28).
 *
 * NO `server-only` / environment access here so it is directly unit-testable;
 * the environment wrapper lives in `keys.ts`.
 *
 * Secret contract: RATE_LIMIT_HMAC_SECRET must be exactly 64 hex characters
 * (case-insensitive) and is DECODED to a 32-byte key before use. The HMAC key is
 * those 32 raw bytes — never the UTF-8 bytes of the 64-char hex string. Subject
 * hashes are lowercase 64-char hex (matching the DB `subject_hash` constraint).
 */
import { createHmac } from "node:crypto";
import type { SubjectDomain } from "@/lib/rate-limit/types";

const HEX_64_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Validate and decode the configured secret into a 32-byte key buffer, or `null`
 * when it is missing, a placeholder, or malformed (empty / not 64 chars /
 * non-hex). Case-insensitive: two hex strings differing only in case decode to
 * the same key.
 */
export function parseHmacSecret(raw: string | undefined | null): Buffer | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!HEX_64_RE.test(trimmed)) return null;
  const key = Buffer.from(trimmed, "hex");
  // 64 hex chars always decode to 32 bytes; assert defensively.
  return key.length === 32 ? key : null;
}

/**
 * Opaque subject hash: HMAC-SHA256 over "<domain>:<value>" keyed by the decoded
 * 32-byte secret, lowercase hex. Domain separation keeps the phone/ip/user/thread
 * namespaces from ever colliding. The caller must pass the RAW value; this module
 * never logs the value or the resulting hash.
 */
export function computeSubjectHash(
  key: Buffer,
  domain: SubjectDomain,
  value: string,
): string {
  return createHmac("sha256", key).update(`${domain}:${value}`).digest("hex");
}
