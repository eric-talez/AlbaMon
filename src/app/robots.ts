import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Crawl policy: public browse/policy pages are indexable; account areas, auth
 * flows, and API endpoints are not. The apply/report user flows under /jobs
 * additionally opt out via per-page `robots: { index: false }` metadata.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/auth",
        "/dashboard",
        "/employer",
        "/forbidden",
        "/login",
        "/signup",
      ],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
