import { NextResponse } from "next/server";
import { buildHealthReport } from "@/lib/ops/health";

export const runtime = "nodejs";

/**
 * Public-safe liveness + configuration-presence endpoint for uptime checks.
 *
 * Always answers 200 with statuses only (never env values or secrets), never
 * touches Supabase/network, and requires no auth. Semantics and the
 * operator playbook live in docs/OPERATIONAL_HEALTH.md.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(buildHealthReport(), {
    // Uptime checks must always observe the live process, never a cached body.
    headers: { "cache-control": "no-store" },
  });
}
