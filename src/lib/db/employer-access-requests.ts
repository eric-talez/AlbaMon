import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmployerAccessRequestRow, ProfileRow } from "@/lib/db/types";
import type { EmployerAccessRequestStatus } from "@/lib/types";
import type { EmployerAccessRequestInput } from "@/lib/employer-access/validation";

/**
 * Data access for employer access requests (Slice 21).
 *
 * Every function runs through the caller's authenticated Supabase session —
 * never the service-role client — so RLS stays the real gate: requesters can
 * only insert/read their own rows, and decisions go through the admin-only
 * review_employer_access_request() SQL function.
 */

export interface EmployerAccessRequestSummary {
  id: string;
  businessName: string;
  city: string;
  state: string;
  status: EmployerAccessRequestStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AdminEmployerAccessRequest {
  id: string;
  businessName: string;
  contactName: string;
  phone: string | null;
  website: string | null;
  city: string;
  state: string;
  reason: string | null;
  status: EmployerAccessRequestStatus;
  requesterDisplayName: string | null;
  requesterEmail: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export type CreateEmployerAccessRequestResult =
  | { status: "ok"; requestId: string }
  | { status: "duplicate_pending" | "not_allowed" | "unavailable" | "error" };

export type LatestEmployerAccessRequestResult =
  | { status: "ok"; request: EmployerAccessRequestSummary | null }
  | { status: "unavailable" | "error" };

export type AdminEmployerAccessRequestsResult =
  | { status: "ok"; requests: AdminEmployerAccessRequest[] }
  | { status: "unavailable" | "error" };

export type PendingEmployerAccessRequestCountResult =
  | { status: "ok"; count: number }
  | { status: "unavailable" | "error" };

export type ReviewEmployerAccessRequestResult =
  | { status: "ok"; decision: "approved" | "rejected" }
  | { status: "conflict" | "not_allowed" | "unavailable" | "error" };

const NOT_ALLOWED_CODES = new Set(["23503", "23514", "42501"]);
const REQUEST_SELECT =
  "id, requester_id, business_name, contact_name, phone, website, city, state, " +
  "reason, status, reviewed_by, reviewed_at, created_at, updated_at";

type RequesterProfileRow = Pick<ProfileRow, "id" | "display_name" | "email">;

/**
 * File an employer access request as the signed-in seeker. The
 * employer_access_requests_insert_own RLS policy is the final gate (self only,
 * runtime role 'seeker', initial pending state); the partial unique index
 * turns a second open request into a duplicate_pending result.
 */
export async function createEmployerAccessRequest(
  requesterId: string,
  input: EmployerAccessRequestInput,
): Promise<CreateEmployerAccessRequestResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("employer_access_requests")
      .insert({
        requester_id: requesterId,
        business_name: input.businessName,
        contact_name: input.contactName,
        phone: input.phone,
        website: input.website,
        city: input.city,
        state: input.state,
        reason: input.reason,
        status: "pending",
      })
      .select("id")
      .single();

    if (!error) return { status: "ok", requestId: data.id as string };
    if (error.code === "23505") return { status: "duplicate_pending" };
    if (NOT_ALLOWED_CODES.has(error.code)) return { status: "not_allowed" };
    throw error;
  } catch (error) {
    console.error("[db] createEmployerAccessRequest failed:", error);
    return { status: "error" };
  }
}

/** Most recent request filed by this user (RLS already scopes to own rows). */
export async function getLatestEmployerAccessRequest(
  requesterId: string,
): Promise<LatestEmployerAccessRequestResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("employer_access_requests")
      .select(REQUEST_SELECT)
      .eq("requester_id", requesterId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!data) return { status: "ok", request: null };
    const row = data as unknown as EmployerAccessRequestRow;
    return {
      status: "ok",
      request: {
        id: row.id,
        businessName: row.business_name,
        city: row.city,
        state: row.state,
        status: row.status,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at,
      },
    };
  } catch (error) {
    console.error("[db] getLatestEmployerAccessRequest failed:", error);
    return { status: "error" };
  }
}

/** Full admin queue, pending requests first, newest first within each group. */
export async function getAdminEmployerAccessRequests(): Promise<AdminEmployerAccessRequestsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("employer_access_requests")
      .select(REQUEST_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = (data ?? []) as unknown as EmployerAccessRequestRow[];
    const requesterIds = [...new Set(rows.map((row) => row.requester_id))];
    const requesters = new Map<string, RequesterProfileRow>();
    if (requesterIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", requesterIds);
      if (profileError) throw profileError;
      for (const profile of (profileRows ?? []) as unknown as RequesterProfileRow[]) {
        requesters.set(profile.id, profile);
      }
    }

    const requests = rows
      .map((row): AdminEmployerAccessRequest => {
        const requester = requesters.get(row.requester_id);
        return {
          id: row.id,
          businessName: row.business_name,
          contactName: row.contact_name,
          phone: row.phone,
          website: row.website,
          city: row.city,
          state: row.state,
          reason: row.reason,
          status: row.status,
          requesterDisplayName: requester?.display_name ?? null,
          requesterEmail: requester?.email ?? null,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at,
        };
      })
      .sort((a, b) => {
        const pendingDifference =
          Number(b.status === "pending") - Number(a.status === "pending");
        return pendingDifference || b.createdAt.localeCompare(a.createdAt);
      });
    return { status: "ok", requests };
  } catch (error) {
    console.error("[db] getAdminEmployerAccessRequests failed:", error);
    return { status: "error" };
  }
}

/** Pending-request count for the admin dashboard card. */
export async function getPendingEmployerAccessRequestCount(): Promise<PendingEmployerAccessRequestCountResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("employer_access_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw error;
    return { status: "ok", count: count ?? 0 };
  } catch (error) {
    console.error("[db] getPendingEmployerAccessRequestCount failed:", error);
    return { status: "error" };
  }
}

/**
 * Approve or reject a pending request through the admin-only SQL function.
 * The function re-checks is_admin() server-side and updates the request and
 * (on approval) profiles.role in one transaction — no service-role client.
 */
export async function reviewEmployerAccessRequest(
  requestId: string,
  decision: "approved" | "rejected",
): Promise<ReviewEmployerAccessRequestResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("review_employer_access_request", {
      request_id: requestId,
      decision,
    });
    if (error) {
      // P0001 = the function's own admin/decision exceptions; 42501 = execute
      // privilege missing (anon).
      if (error.code === "P0001" || error.code === "42501") {
        return { status: "not_allowed" };
      }
      throw error;
    }
    if (data === "conflict") return { status: "conflict" };
    if (data === "approved" || data === "rejected") {
      return { status: "ok", decision: data };
    }
    throw new Error(`Unexpected review result: ${String(data)}`);
  } catch (error) {
    console.error("[db] reviewEmployerAccessRequest failed:", error);
    return { status: "error" };
  }
}
