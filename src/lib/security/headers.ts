/**
 * Production HTTP security headers for K-Work US (Slice 26).
 *
 * Pure and dependency-free (no `next`, `server-only`, or `@/` imports) so it can
 * be imported both by `next.config.ts` (relative path, at build/config load) and
 * by unit tests. All environment-dependent logic lives here, keeping
 * `next.config.ts` a thin wiring shim.
 *
 * Policy summary:
 * - The app's only external runtime origin is Supabase (client-side auth). Every
 *   other resource class is same-origin, so the CSP is `'self'`-based with the
 *   Supabase HTTP(S)+WS(S) origins added to `connect-src`.
 * - No nonces (they force every page into dynamic rendering) and no
 *   `'unsafe-eval'`. Next emits an unnonced inline bootstrap script + framework
 *   inline styles, so `script-src`/`style-src` need `'unsafe-inline'`.
 * - `Content-Security-Policy`, `Strict-Transport-Security`, and
 *   `upgrade-insecure-requests` are production-only; development gets only the
 *   four always-safe headers (a strict CSP fights React's dev `eval` + HMR).
 */

export interface SecurityHeaderOptions {
  /** True for a production build/runtime (`process.env.NODE_ENV === "production"`). */
  isProduction: boolean;
  /** Raw `NEXT_PUBLIC_SUPABASE_URL`; may be undefined, blank, or a placeholder. */
  supabaseUrl: string | undefined;
}

export interface HttpHeader {
  key: string;
  value: string;
}

/** Placeholder fragments shipped in `.env.example` — treated as "not configured". */
const SUPABASE_PLACEHOLDER_FRAGMENTS = [
  "your-project",
  "your-anon-key",
  "example.com",
];

/**
 * The `connect-src` origins for Supabase, derived from `NEXT_PUBLIC_SUPABASE_URL`:
 * the HTTP(S) origin plus its matching WS(S) origin (so browser auth fetches and
 * any future realtime socket to the same host are allowed).
 *
 * Returns `[]` for a missing, blank, placeholder, or malformed value — a bad or
 * unconfigured URL must never throw (it would break `next build`) and must not
 * widen the policy. Only `http`/`https` inputs yield origins.
 */
export function supabaseConnectOrigins(
  supabaseUrl: string | undefined,
): string[] {
  const raw = supabaseUrl?.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (SUPABASE_PLACEHOLDER_FRAGMENTS.some((f) => lower.includes(f))) return [];

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];

  const wsScheme = url.protocol === "https:" ? "wss:" : "ws:";
  return [url.origin, `${wsScheme}//${url.host}`];
}

/** Restrictive `Permissions-Policy`: deny every powerful feature the app never
 * uses (unknown directives are safely ignored by browsers). */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

/**
 * The production Content-Security-Policy string. Single-origin (`'self'`) except
 * `connect-src`, which also carries the Supabase HTTP(S)+WS(S) origins.
 */
export function buildContentSecurityPolicy(
  options: SecurityHeaderOptions,
): string {
  const connectSrc = ["'self'", ...supabaseConnectOrigins(options.supabaseUrl)];

  const directives: string[] = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    // Next emits an unnonced inline bootstrap script; no external/eval scripts.
    "script-src 'self' 'unsafe-inline'",
    // App pages need only 'self'; 'unsafe-inline' keeps Next's inline-styled
    // framework error page rendering (low risk — style only, no XSS sinks).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

/**
 * The response header list applied to every route by `next.config.ts`.
 *
 * Production: all six headers. Development: only the four always-safe headers
 * (no CSP, no HSTS) — see the module comment.
 */
export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): HttpHeader[] {
  const headers: HttpHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ];

  if (options.isProduction) {
    headers.push(
      {
        key: "Content-Security-Policy",
        value: buildContentSecurityPolicy(options),
      },
      // 2 years. No includeSubDomains/preload — not every subdomain is proven
      // permanently HTTPS-capable.
      { key: "Strict-Transport-Security", value: "max-age=63072000" },
    );
  }

  return headers;
}
