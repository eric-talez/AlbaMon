import "server-only";

import { ROLES, type Role } from "@/lib/types";
import type { ProfileRow } from "@/lib/db/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-only profile reads for K-Work US.
 *
 * `profiles.role` is the runtime source of truth for authorization (Slice 4).
 * These helpers are the ONLY place runtime role is read from the database; they
 * are used by `@/lib/auth/session` to build the current user.
 *
 * Behavior:
 * - Supabase NOT configured: these return null. The DB is the Supabase-only
 *   path — dev-mode auth (the unsigned cookie) is handled separately in
 *   `session.ts` and never touches this module.
 * - Supabase configured: reads the caller's own `profiles` row. The
 *   `profiles_select_own` RLS policy (id = auth.uid()) lets the cookie-
 *   authenticated server client read its own row.
 * - On any error or missing row we log and return null; this layer never throws.
 */

const PROFILE_SELECT =
  "id, role, account_status, email_notifications_enabled, suppressed_email, email, display_name, phone, city, state, created_at, updated_at";

function coerceRole(value: unknown): Role | null {
  return (ROLES as readonly string[]).includes(value as string)
    ? (value as Role)
    : null;
}

/** The caller's profile row, or null if unconfigured / missing / unreadable. */
export async function getProfileByUserId(
  userId: string,
): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return (data as ProfileRow | null) ?? null;
  } catch (err) {
    console.error("[db] getProfileByUserId failed:", err);
    return null;
  }
}

/** One narrow profile read supplies the trusted session fields. */
export async function getAuthProfileForUser(userId: string): Promise<{
  role: Role;
  accountStatus: "active" | "suspended";
  displayName: string | null;
} | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles")
      .select("role, account_status, display_name").eq("id", userId).maybeSingle();
    if (error || !data) return null;
    const role = coerceRole(data.role);
    if (!role || !["active", "suspended"].includes(data.account_status)) return null;
    return { role, accountStatus: data.account_status,
      displayName: typeof data.display_name === "string" ? data.display_name : null };
  } catch {
    return null;
  }
}
