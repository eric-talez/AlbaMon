"use server";

import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/lib/types";
import { roleHome } from "@/lib/auth/access";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { writeDevSession, clearDevSession } from "@/lib/auth/dev-session";

function parseRole(value: FormDataEntryValue | null): Role {
  return (ROLES as readonly string[]).includes(value as string)
    ? (value as Role)
    : "seeker";
}

function normalizeNext(value: FormDataEntryValue | null): string | null {
  // Only allow same-site relative paths to avoid open-redirect.
  if (typeof value !== "string") return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/**
 * Dev-mode sign in / sign up. Sets a dev-session cookie with the chosen role.
 * In Supabase mode this is replaced by real email/password or OAuth flows; we
 * surface a clear message instead of silently faking a session.
 */
export async function signInDev(formData: FormData): Promise<void> {
  if (isSupabaseConfigured()) {
    // Real auth is configured — dev sign-in is disabled on purpose.
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

/** Sign out of the current session (dev mode clears the dev cookie). */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) {
    await clearDevSession();
  }
  // In Supabase mode the client SDK + proxy handle token clearing; a future
  // slice wires supabase.auth.signOut() here.
  redirect("/");
}
