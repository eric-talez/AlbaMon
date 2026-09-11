import { hasCurrentPolicies } from "@/lib/policies";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthProfileForUser } from "@/lib/db/profiles";

function privateRedirect(path: string): NextResponse {
  // Relative Location preserves the browser origin and host-only cookies.
  // NextURL normalizes loopback hosts, so rebuilding an absolute URL can lose the session.
  const response = new NextResponse(null, { status: 307, headers: { Location: path } });
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/** Exchange the PKCE code before reading the profile; preserve only safe returns. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));
  if (isSupabaseConfigured() && code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const profile = await getAuthProfileForUser(data.user.id);
      if (profile) {
        const destination = profile.displayName?.trim() && hasCurrentPolicies(profile)
          ? next : `/dashboard/profile?next=${encodeURIComponent(next)}`;
        return privateRedirect(destination);
      }
    }
    return privateRedirect("/login?error=auth_callback");
  }
  return privateRedirect("/login");
}
