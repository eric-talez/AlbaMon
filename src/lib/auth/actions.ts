"use server";

import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/lib/types";
import { roleHome } from "@/lib/auth/access";
import { isSafeNextPath } from "@/lib/auth/redirect";
import {
  isSupabaseConfigured,
  isDevAuthEnabled,
  assertAuthConfiguredForProduction,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeDevSession, clearDevSession } from "@/lib/auth/dev-session";

function parseRole(value: FormDataEntryValue | null): Role {
  return (ROLES as readonly string[]).includes(value as string)
    ? (value as Role)
    : "seeker";
}

function normalizeNext(value: FormDataEntryValue | null): string | null {
  // Only allow same-site relative paths to avoid open-redirect.
  return isSafeNextPath(value) ? value : null;
}

/**
 * Dev-mode sign in / sign up. Sets a dev-session cookie with the chosen role.
 * In Supabase mode this is replaced by real email/password or OAuth flows; we
 * surface a clear message instead of silently faking a session.
 */
export async function signInDev(formData: FormData): Promise<void> {
  if (!isDevAuthEnabled()) {
    // In production without Supabase this throws (fail closed); otherwise
    // Supabase is configured and real auth handles sign-in.
    assertAuthConfiguredForProduction();
    redirect("/login?error=use_real_auth");
  }

  const role = parseRole(formData.get("role"));
  const emailRaw = formData.get("email");
  const email =
    typeof emailRaw === "string" && emailRaw.trim()
      ? emailRaw.trim()
      : `${role}@dev.local`;
  const next = normalizeNext(formData.get("next"));

  await writeDevSession({ id: `dev-${role}`, email, role });
  redirect(next ?? roleHome(role));
}

/**
 * Sign out of the current session.
 * - Supabase mode: revoke the session server-side via `supabase.auth.signOut()`.
 * - Dev mode: clear the dev-session cookie.
 * Then redirect home.
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } else {
    await clearDevSession();
  }
  redirect("/");
}
