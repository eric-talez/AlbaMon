import "server-only";
import type { AuthUser } from "@/lib/auth/types";
import { isSupabaseConfigured, isDevAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileRoleForUser } from "@/lib/db/profiles";
import { readDevSession } from "@/lib/auth/dev-session";

/**
 * Server-side source of truth for the current user. This is what guards and
 * Server Components must use — never trust client state for authorization.
 *
 * - Supabase configured: reads the verified user from Supabase, then reads the
 *   role from `profiles.role` (the DB source of truth, Slice 4). The forgeable
 *   `user_metadata.role` is NOT trusted for authorization.
 * - Dev mode (non-production, Supabase unconfigured): reads the dev cookie.
 * - Production without Supabase: FAILS CLOSED — returns null so no one is
 *   authenticated via the forgeable dev cookie.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Role comes ONLY from `profiles.role` — never from `user.user_metadata`,
    // which is client-influenced and must not drive authorization.
    const role = await getProfileRoleForUser(user.id);
    // Fail closed: a Supabase-authenticated user without a usable profile row is
    // treated as unauthenticated until their profile exists. We do not grant
    // even baseline `seeker` access, so provisioning/seed bugs surface early.
    if (role === null) return null;

    return { id: user.id, email: user.email ?? "", role, isDev: false };
  }

  // Not configured. Only dev mode (outside production) may use the dev cookie;
  // `readDevSession` itself also re-checks this, so production is doubly safe.
  if (!isDevAuthEnabled()) return null;
  return readDevSession();
}

/** Whether the app is currently running with dev-mode auth. */
export function isDevAuthMode(): boolean {
  return isDevAuthEnabled();
}
