import "server-only";
import { cookies } from "next/headers";
import { ROLES, type Role } from "@/lib/types";
import type { AuthUser } from "@/lib/auth/types";

/**
 * Dev-mode session, used ONLY when Supabase is not configured (placeholder env).
 * Stores a base64 JSON blob in a cookie so the role-guard flow is fully
 * exercisable locally without a live auth provider.
 *
 * This is intentionally NOT cryptographically signed — it is a developer
 * convenience and must never be enabled in production. Real auth uses Supabase.
 */
const DEV_COOKIE = "kw_dev_session";

interface DevSessionPayload {
  id: string;
  email: string;
  role: Role;
}

function isValidPayload(value: unknown): value is DevSessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    (ROLES as readonly string[]).includes(v.role)
  );
}

export async function readDevSession(): Promise<AuthUser | null> {
  const store = await cookies();
  const raw = store.get(DEV_COOKIE)?.value;
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    if (!isValidPayload(json)) return null;
    return { id: json.id, email: json.email, role: json.role, isDev: true };
  } catch {
    return null;
  }
}

/** Must be called from a Server Action or Route Handler. */
export async function writeDevSession(payload: DevSessionPayload): Promise<void> {
  const store = await cookies();
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  store.set(DEV_COOKIE, encoded, {
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
