/**
 * Supabase environment configuration.
 *
 * Real credentials live only in environment variables (never committed).
 * `.env.example` ships placeholders. When the placeholders are still in place
 * (or vars are missing), the app falls back to dev-mode auth so it remains
 * runnable and testable without a live Supabase project.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Placeholder values shipped in .env.example — treated as "not configured". */
const PLACEHOLDER_FRAGMENTS = ["your-project", "your-anon-key", "example.com"];

function looksLikePlaceholder(value: string): boolean {
  if (!value.trim()) return true;
  return PLACEHOLDER_FRAGMENTS.some((fragment) => value.includes(fragment));
}

/**
 * True only when both the Supabase URL and anon key are present and not the
 * shipped placeholders. Used to decide between real Supabase auth and dev mode.
 *
 * Reads `process.env` dynamically (not the module-level consts) so this single
 * predicate stays correct under tests that stub the environment.
 */
export function isSupabaseConfigured(): boolean {
  return (
    !looksLikePlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") &&
    !looksLikePlaceholder(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "")
  );
}

/** True when running a production build/runtime. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Dev-mode auth (the unsigned `kw_dev_session` role picker) is permitted ONLY
 * outside production AND only while Supabase is not configured. It must never be
 * reachable in production — an unsigned cookie there would be trivially forgeable.
 */
export function isDevAuthEnabled(): boolean {
  return !isProduction() && !isSupabaseConfigured();
}

/**
 * Fail closed: in production, real Supabase credentials are mandatory. Calling
 * this turns a dangerous misconfiguration (which would otherwise silently fall
 * back to forgeable dev auth) into a loud, safe error.
 */
export function assertAuthConfiguredForProduction(): void {
  if (isProduction() && !isSupabaseConfigured()) {
    throw new Error(
      "Auth is misconfigured: production requires real Supabase credentials " +
        "(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
        "Dev-mode auth is disabled in production.",
    );
  }
}
