/**
 * Shared sanitizer for the `?next=` redirect target used across auth flows
 * (OAuth callback, dev sign-in, phone OTP success navigation).
 *
 * Pure and dependency-free so it is safe to import from Client Components.
 */

/** Where auth flows land when no (valid) `next` target was provided. */
export const DEFAULT_AUTH_REDIRECT = "/dashboard";

/**
 * True only for same-site relative paths that stay same-site after WHATWG URL
 * normalization. Anything else must fall back — `next` is attacker-suppliable
 * via the query string, and an accepted value ends up in `Location:` headers
 * and client-side `location.assign()` calls.
 */
export function isSafeNextPath(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return false;
  // "//evil.com" is protocol-relative (cross-origin).
  if (raw.startsWith("//")) return false;
  // URL parsing treats a backslash like a slash, so "/\evil.com" is
  // "//evil.com" in disguise.
  if (raw.startsWith("/\\")) return false;
  // The URL parser strips ASCII tab/newline/CR BEFORE parsing, so a path like
  // "/" + newline + "/evil.com" also collapses to "//evil.com". Reject every
  // ASCII control character (0x00-0x1f); none belongs in a legitimate path.
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) < 0x20) return false;
  }
  return true;
}

/** The given path if safe, otherwise `fallback` (default: the dashboard). */
export function sanitizeNextPath(
  raw: unknown,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  return isSafeNextPath(raw) ? raw : fallback;
}
