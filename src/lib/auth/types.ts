import type { Role } from "@/lib/types";

/** The minimal authenticated user shape the app relies on. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** True when this identity came from the dev-mode cookie, not Supabase. */
  isDev: boolean;
}

/** Korean-first labels for roles, used in UI. */
export const ROLE_LABELS: Record<Role, string> = {
  seeker: "구직자",
  employer: "고용주",
  admin: "관리자",
};
