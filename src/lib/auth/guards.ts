import "server-only";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth/types";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateAccess, type Area } from "@/lib/auth/access";

/**
 * Server-side route guards. Call these at the top of a protected layout/page.
 * They enforce authorization on the server and redirect — UI-only checks are
 * never sufficient.
 */

/** Require any authenticated user; otherwise redirect to /login. */
export async function requireUser(next?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(next));
  return user;
}

/**
 * Require access to an area per the central permission matrix.
 * - unauthenticated → /login
 * - wrong role → /forbidden
 */
export async function requireArea(area: Area, next?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  const result = evaluateAccess(user?.role ?? null, area);

  if (result === "unauthenticated") redirect(loginUrl(next));
  if (result === "forbidden") redirect("/forbidden");

  // result === "ok" implies an authenticated user for any non-public area.
  return user as AuthUser;
}

/** Require one exact runtime DB role; hierarchy access does not apply. */
export async function requireRole(
  role: Role,
  next?: string,
): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(next));
  if (user.role !== role) redirect("/forbidden");
  return user;
}

function loginUrl(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
