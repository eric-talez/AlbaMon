import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return process.env.NEXT_PUBLIC_INDEXING_ENABLED === "false"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]
      : [];
  },
};

export default nextConfig;
