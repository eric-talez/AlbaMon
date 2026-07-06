import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Static public pages only. Per-job URLs are deliberately omitted for the
 * private beta: this file is generated at build time, so job entries would go
 * stale between deploys (or list placeholder data in builds without Supabase).
 * Crawlers reach approved jobs through /jobs. Revisit after launch.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/work-authorization-info`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/posting-policy`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
