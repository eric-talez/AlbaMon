import "server-only";
import { ROLES, type Role } from "@/lib/types";
import type { AuthUser } from "@/lib/auth/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readDevSession } from "@/lib/auth/dev-session";

function coerceRole(value: unknown): Role {
  return (ROLES as readonly string[]).includes(value as string)
    ? (value as Role)
    : "seeker";
}

/**
 * Server-side source of truth for the current user. This is what guards and
 * Server Components must use — never trust client state for authorization.
 *
 * - Supabase configured: reads the verified session from Supabase.
 * - Otherwise (dev mode): reads the dev-session cookie.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    // Role is stored in user metadata for now; Slice 3 moves it to `profiles`.
    const role = coerceRole(user.user_metadata?.role);
    return { id: user.id, email: user.email ?? "", role, isDev: false };
  }

  return readDevSession();
}

/** Whether the app is currently running with dev-mode auth. */
export function isDevAuthMode(): boolean {
  return !isSupabaseConfigured();
}
