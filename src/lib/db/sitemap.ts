import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

/** Cookie-free: the canonical safe view applies is_job_open for every caller. */
export async function getSitemapJobs(): Promise<Array<{ id: string; updatedAt: string }>> {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Sitemap unavailable");
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const jobs: Array<{ id: string; updatedAt: string }> = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from("public_job_listings").select("id,updated_at")
        .order("id", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) jobs.push({ id: row.id, updatedAt: row.updated_at });
      if ((data?.length ?? 0) < 1000) return jobs;
    }
  } catch {
    console.error("[db] getSitemapJobs failed");
    throw new Error("Sitemap unavailable");
  }
}
