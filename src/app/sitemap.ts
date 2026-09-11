import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

import { getSitemapJobs } from "@/lib/db/sitemap";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const jobs = await getSitemapJobs();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/jobs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/work-authorization-info`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/posting-policy`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    ...jobs.map((job) => ({ url: `${base}/jobs/${encodeURIComponent(job.id)}`, lastModified: job.updatedAt })),
  ];
}
