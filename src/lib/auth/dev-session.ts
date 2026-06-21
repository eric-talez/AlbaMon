import "server-only";
import { cookies } from "next/headers";
import type { AuthUser } from "@/lib/auth/types";
import { isDevAuthEnabled } from "@/lib/supabase/config";
import {
  DEV_COOKIE,
  decodeDevSession,
  encodeDevSession,
  type DevSessionPayload,
} from "@/lib/auth/dev-session-core";

/**
 * Cookie wrapper around the pure dev-session core (see `dev-session-core.ts`).
 *
 * Every entry point is gated on `isDevAuthEnabled()` so the unsigned dev cookie
 * can never read OR write a session in production (or once Supabase is wired up).
 */

export async function readDevSession(): Promise<AuthUser | null> {
  // Production / Supabase-configured → `allowDevAuth` is false → always null.
  if (!isDevAuthEnabled()) return null;
  const store = await cookies();
  return decodeDevSession(store.get(DEV_COOKIE)?.value, true);
}

/** Must be called from a Server Action or Route Handler. */
export async function writeDevSession(payload: DevSessionPayload): Promise<void> {
  if (!isDevAuthEnabled()) {
    throw new Error(
      "Refusing to write a dev session: dev-auth is disabled " +
        "(production, or Supabase is configured).",
    );
  }
  const store = await cookies();
  store.set(DEV_COOKIE, encodeDevSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/** Must be called from a Server Action or Route Handler. */
export async function clearDevSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_COOKIE);
}
