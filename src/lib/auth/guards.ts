import { policyAcceptanceIdentity } from "@/lib/policy-publication.mjs";
import { hasCurrentPolicies, POLICY_WRITE_MESSAGE } from "@/lib/policies";
import { SUSPENDED_WRITE_MESSAGE } from "@/lib/db/write-errors";
import "server-only";
import { redirect } from "next/navigation";
import type { AuthUser } from "@/lib/auth/types";
import type { Role } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth/session";
import { canUseAdmin, evaluateAccess, type Area } from "@/lib/auth/access";

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

  if (area === "admin" && user) requireAdminSession(user);

  // result === "ok" implies an authenticated user for any non-public area.
  return user as AuthUser;
}

/**
 * Employer-area entry with a recovery path (Slice 21): signed-out users go to
 * /login as before, but seekers are routed to the employer access request
 * flow instead of a dead-end /forbidden. Employers and admins pass through
 * unchanged. Any other forbidden state still lands on /forbidden.
 */
export async function requireEmployerAreaAccess(next?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  const result = evaluateAccess(user?.role ?? null, "employer");

  if (result === "unauthenticated") redirect(loginUrl(next));
  if (result === "forbidden") {
    redirect(user?.role === "seeker" ? "/employer/request-access" : "/forbidden");
  }
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
  if (role === "admin") requireAdminSession(user);
  return user;
}

function loginUrl(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

function requireAdminSession(user: AuthUser): void {
  if (user.accountStatus !== "active") redirect("/forbidden");
  if (!canUseAdmin(user)) redirect("/account/security");
}

/** Only writes call this; suspended users retain their read/history routes. */
export function activeWriterError(user: AuthUser, options: { acknowledgingPolicies?: boolean } = {}): { status: "error"; message: string } | null {
  if (user.accountStatus === "suspended") return { status: "error", message: SUSPENDED_WRITE_MESSAGE };
  if (!options.acknowledgingPolicies && !hasCurrentPolicies(user, policyAcceptanceIdentity())) return { status: "error", message: POLICY_WRITE_MESSAGE };
  return null;
}
