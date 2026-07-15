import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";

/**
 * Server-side Supabase client for Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session cookies. `cookies()` is async in Next 16.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` can be called from a Server Component render, where setting
          // cookies is not allowed. The proxy refreshes the session instead, so
          // this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Strict server-side Supabase client for Server Actions and Route Handlers ONLY
 * (never a Server Component render). Uses the anon key — never the service role.
 *
 * Unlike `createSupabaseServerClient()`, `setAll` does NOT swallow write
 * failures. In these contexts writing cookies is always permitted, so a failure
 * means the session did not persist — it must surface, never be silently
 * dropped. This is the client the OTP verify action uses to establish the
 * session: a cookie-write failure there must not read as a successful sign-in.
 */
export async function createSupabaseServerActionClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
