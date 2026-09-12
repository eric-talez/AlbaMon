import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuditLogRow } from "@/lib/db/types";

/**
 * Read-only access to audit_logs for the admin dashboard (Slice 22).
 *
 * Reads run through the caller's authenticated session; the
 * audit_logs_select_admin RLS policy is the gate. Rows are written only by
 * the admin-only SECURITY DEFINER review functions (Slice 27), which record
 * each moderation decision atomically with its entity change — this module
 * stays read-only. An empty result simply means no admin decisions yet.
 */

export interface AdminAuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}

export type RecentAdminAuditLogsResult =
  | { status: "ok"; entries: AdminAuditLogEntry[] }
  | { status: "unavailable" | "error" };

type AuditLogListRow = Pick<
  AuditLogRow,
  "id" | "action" | "entity_type" | "created_at"
>;

/** Latest admin-relevant audit entries, newest first. */
export async function getRecentAdminAuditLogs(
  limit = 5,
): Promise<RecentAdminAuditLogsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return {
      status: "ok",
      entries: ((data ?? []) as unknown as AuditLogListRow[]).map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    console.error("[db] getRecentAdminAuditLogs failed:", error);
    return { status: "error" };
  }
}
