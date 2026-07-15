/**
 * Dependency-free URL classification for the E2E external-network guard. Used
 * by tests/e2e/helpers.ts and pinned by tests/network-policy.test.ts.
 *
 * A request is ALLOWED only when it targets the EXACT configured E2E origin
 * (derived from Playwright's `baseURL`) or is an inert, non-network browser URL
 * (`about:` / `data:` / `blob:`). Everything else fails CLOSED:
 *   - a different localhost PORT (e.g. a local Supabase on `:54321`),
 *   - a loopback host that differs from baseURL (`127.0.0.1` / `::1` vs.
 *     `localhost`) — hostname equivalence is deliberately NOT sufficient,
 *   - unsupported schemes, and malformed / unparseable URLs.
 *
 * The single allowed non-HTTP origin is the local Next.js dev/HMR WebSocket:
 * the SAME host and effective port as baseURL, with the `ws`/`wss` protocol
 * that corresponds to baseURL's `http`/`https`.
 */

const INERT_SCHEME = /^(?:about|data|blob):/i;

export function isAllowedE2EUrl(rawUrl: string, baseUrl: string): boolean {
  if (typeof rawUrl !== "string") return false;
  if (INERT_SCHEME.test(rawUrl)) return true;

  let target: URL;
  let base: URL;
  try {
    target = new URL(rawUrl);
    base = new URL(baseUrl);
  } catch {
    return false; // malformed / unsupported / unparseable → fail closed
  }

  // Exact HTTP(S) origin: scheme + host + port must all match baseURL.
  if (target.origin === base.origin) return true;

  // The local dev/HMR WebSocket only: same host:port, ws↔http / wss↔https.
  const wsProtocol = base.protocol === "https:" ? "wss:" : "ws:";
  return target.protocol === wsProtocol && target.host === base.host;
}
