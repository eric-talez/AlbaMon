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
 */
export function isSupabaseConfigured(): boolean {
  return !looksLikePlaceholder(SUPABASE_URL) && !looksLikePlaceholder(SUPABASE_ANON_KEY);
}
