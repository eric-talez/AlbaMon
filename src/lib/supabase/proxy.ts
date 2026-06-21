import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase auth session on each request and forwards the updated
 * cookies. Called from the root `proxy.ts` (Next 16's renamed middleware).
 *
 * When Supabase is not configured (dev mode), this is a no-op pass-through so
 * the app runs without a live project.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the user to trigger a token refresh when needed. Do NOT use this for
  // authorization decisions — guards re-check on the server per route.
  await supabase.auth.getUser();

  return response;
}
