import "server-only";

import { isIP } from "node:net";

/**
 * Trusted client-IP extraction for OTP rate limiting (Slice 28).
 *
 * DEPLOYMENT EVIDENCE — this app runs on Vercel (see docs/DEPLOYMENT.md). Vercel's
 * edge network sets and OVERWRITES the forwarding headers below on every request,
 * so an inbound client-supplied `x-forwarded-for` cannot spoof them; their value
 * is the real connecting client as seen by Vercel. We therefore trust these
 * headers ONLY when `VERCEL === "1"`. Off Vercel (local, other hosts) we trust no
 * inbound forwarding header and fall back to a single shared `unknown` bucket —
 * never unlimited, and never another provider's assumption.
 *
 * The raw IP is never persisted or logged; only its HMAC hash reaches the DB.
 */

/** Shared bucket used when no trusted client IP is available. */
export const UNKNOWN_IP = "unknown";

/** Vercel-provided headers, in priority order (most specific first). */
export const VERCEL_IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "x-real-ip",
] as const;

export interface ClientIpEnv {
  readonly isVercel: boolean;
}

/**
 * Normalize a single IP candidate: strip an optional port and IPv6 brackets,
 * validate as IPv4/IPv6 (via `node:net`), lowercase IPv6. Returns `UNKNOWN_IP`
 * for anything malformed — a hostname, a zone-suffixed (`%eth0`) or oversized
 * value, an empty string, etc. Never throws.
 */
export function normalizeClientIp(raw: string): string {
  if (typeof raw !== "string") return UNKNOWN_IP;
  let candidate = raw.trim();
  // Oversized junk: the longest valid textual IP (IPv4-mapped IPv6) is 45 chars.
  if (candidate.length === 0 || candidate.length > 45) return UNKNOWN_IP;

  if (candidate.startsWith("[")) {
    // Bracketed IPv6, optionally with a port: "[::1]" or "[2001:db8::1]:443".
    const close = candidate.indexOf("]");
    if (close === -1) return UNKNOWN_IP;
    candidate = candidate.slice(1, close);
  } else {
    const colonCount = (candidate.match(/:/g) ?? []).length;
    if (candidate.includes(".") && colonCount === 1) {
      // IPv4 with a port: "1.2.3.4:5678". (Unbracketed IPv6, incl. IPv4-mapped,
      // has 2+ colons and is left intact — it carries no port.)
      candidate = candidate.slice(0, candidate.indexOf(":"));
    }
  }

  // Reject scoped/zone-id addresses (fe80::1%eth0): local-scope artifacts that
  // should never be a public client IP. Some Node versions' isIP() accepts them.
  if (candidate.includes("%")) return UNKNOWN_IP;

  const version = isIP(candidate);
  if (version === 0) return UNKNOWN_IP;
  return version === 6 ? candidate.toLowerCase() : candidate;
}

/**
 * Resolve the trusted client IP from request headers.
 *
 * Trusts the Vercel headers ONLY when `env.isVercel`. Walks them in priority
 * order, parses the FIRST comma-separated token (Vercel's client entry), and
 * returns the first token that normalizes to a valid IP. A malformed token is
 * rejected (never used raw); if nothing valid is found, returns `UNKNOWN_IP`.
 */
export function selectClientIp(
  get: (header: string) => string | null | undefined,
  env: ClientIpEnv,
): string {
  if (!env.isVercel) return UNKNOWN_IP;
  for (const header of VERCEL_IP_HEADERS) {
    const raw = get(header);
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim() ?? "";
    if (first.length === 0) continue;
    const normalized = normalizeClientIp(first);
    if (normalized !== UNKNOWN_IP) return normalized;
  }
  return UNKNOWN_IP;
}

/**
 * Server-only entry: resolve the trusted client IP from the incoming request
 * headers. `next/headers` is imported lazily so the pure helpers above stay
 * unit-testable without the Next runtime.
 */
export async function getTrustedClientIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();
  return selectClientIp((name) => store.get(name), {
    isVercel: process.env.VERCEL === "1",
  });
}
