"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/**
 * Browser-side Supabase client for use in Client Components.
 * Only uses the public anon key. Server-side authorization must NEVER rely on
 * this — see lib/auth/guards.ts.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
