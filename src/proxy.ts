import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 "proxy" (formerly middleware). Keeps the Supabase session fresh.
 * Authorization is enforced per-route by server-side guards, not here.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip operational/worker routes, static assets, and image optimization.
  matcher: [
    "/((?!api/health(?:/|$)|api/ready(?:/|$)|api/internal(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
