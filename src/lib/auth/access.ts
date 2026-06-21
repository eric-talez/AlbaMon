/**
 * Pure, framework-free authorization logic for K-Work US.
 *
 * This module has NO Next.js / Supabase imports on purpose: it is the single
 * source of truth for "which role may enter which area", and it is fully unit
 * tested. The server-side guards (lib/auth/guards.ts) translate these results
 * into redirects. UI must never be the only thing protecting a route.
 */
import type { Role } from "@/lib/types";

/** Logical access areas, each mapping to a route subtree. */
export const AREAS = ["public", "dashboard", "employer", "admin"] as const;
export type Area = (typeof AREAS)[number];

/**
 * Roles allowed in each area. `null` means public (anonymous allowed).
 * Note the hierarchy: admins may enter employer areas; any authenticated user
 * may enter the generic dashboard.
 */
export const AREA_REQUIRED_ROLES: Record<Area, readonly Role[] | null> = {
  public: null,
  dashboard: ["seeker", "employer", "admin"],
  employer: ["employer", "admin"],
  admin: ["admin"],
};

export type AccessResult = "ok" | "unauthenticated" | "forbidden";

/**
 * Decide whether a user with `role` (or `null` if signed out) may access `area`.
 */
export function evaluateAccess(role: Role | null, area: Area): AccessResult {
  const required = AREA_REQUIRED_ROLES[area];
  if (required === null) return "ok";
  if (role === null) return "unauthenticated";
  return required.includes(role) ? "ok" : "forbidden";
}

/** Convenience boolean form. */
export function canAccess(role: Role | null, area: Area): boolean {
  return evaluateAccess(role, area) === "ok";
}

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  seeker: "/dashboard",
  employer: "/employer",
  admin: "/admin",
};

export function roleHome(role: Role): string {
  return ROLE_HOME[role];
}
