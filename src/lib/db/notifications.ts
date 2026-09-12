import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getNotificationQueueHealth(): Promise<{
  pending: number; oldest_available_at: string | null; failed: number; overdue: boolean;
} | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await (await createSupabaseServerClient()).rpc("get_notification_queue_health");
    return error ? null : data?.[0] ?? null;
  } catch { return null; }
}
