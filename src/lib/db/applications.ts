import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateApplicationResult =
  | "created"
  | "duplicate"
  | "not_allowed"
  | "unavailable"
  | "error";

const NOT_ALLOWED_CODES = new Set(["23503", "23514", "42501"]);

/**
 * Create one seeker application through the caller's authenticated Supabase
 * session. RLS remains the final authorization gate; this helper never uses a
 * service-role client and never substitutes a mock write.
 */
export async function createApplication(
  jobId: string,
  seekerId: string,
  coverNote: string | null,
): Promise<CreateApplicationResult> {
  if (!isSupabaseConfigured()) return "unavailable";

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("applications").insert({
      job_id: jobId,
      seeker_id: seekerId,
      cover_note: coverNote,
    });

    if (!error) return "created";
    if (error.code === "23505") return "duplicate";
    if (NOT_ALLOWED_CODES.has(error.code)) return "not_allowed";

    console.error("[db] createApplication failed:", error);
    return "error";
  } catch (error) {
    console.error("[db] createApplication failed:", error);
    return "error";
  }
}
