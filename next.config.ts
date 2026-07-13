import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

// Relative import (not the `@/` alias): next.config.ts is loaded outside the
// app's tsconfig-paths resolution, and the helper is dependency-free.
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          isProduction: process.env.NODE_ENV === "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
    ];
  },
};

export default nextConfig;
