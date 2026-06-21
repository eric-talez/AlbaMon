/**
 * Pure, framework-free encode/decode for the dev-mode session.
 *
 * This module has NO `server-only` / Next.js imports so it can be unit tested
 * directly. The cookie wrapper lives in `dev-session.ts`.
 *
 * SECURITY: the dev session is a plain base64 JSON blob — it is NOT signed and
 * is trivially forgeable. `decodeDevSession` therefore refuses to produce a user
 * unless the caller explicitly passes `allowDevAuth = true` (which callers derive
 * from `isDevAuthEnabled()`), guaranteeing it can never authenticate anyone in
 * production.
 */
import { ROLES, type Role } from "@/lib/types";
import type { AuthUser } from "@/lib/auth/types";

/** Cookie name for the dev-mode (non-production) session. */
export const DEV_COOKIE = "kw_dev_session";

export interface DevSessionPayload {
  id: string;
  email: string;
  role: Role;
}

export function isValidPayload(value: unknown): value is DevSessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    (ROLES as readonly string[]).includes(v.role)
  );
}

export function encodeDevSession(payload: DevSessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/**
 * Decode a dev-session cookie value into an `AuthUser`, or `null`.
 *
 * Returns `null` (no authentication) whenever `allowDevAuth` is false — this is
 * the production kill-switch: even a perfectly-formed forged admin cookie yields
 * `null` in production.
 */
export function decodeDevSession(
  raw: string | undefined,
  allowDevAuth: boolean,
): AuthUser | null {
  if (!allowDevAuth) return null;
  if (!raw) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (!isValidPayload(json)) return null;
    return { id: json.id, email: json.email, role: json.role, isDev: true };
  } catch {
    return null;
  }
}
