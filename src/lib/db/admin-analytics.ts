import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATION_STATUSES,
  MODERATION_STATUSES,
  REPORT_STATUSES,
  type ApplicationStatus,
  type ModerationStatus,
  type ReportStatus,
} from "@/lib/types";

type AnalyticsClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface CountResponse {
  count: number | null;
  error: unknown;
}

interface CountBuilder extends PromiseLike<CountResponse> {
  eq(column: string, value: string | boolean): CountBuilder;
  gte(column: string, value: string): CountBuilder;
}

type CountFilter = (query: CountBuilder) => CountBuilder;

export interface AdminAnalytics {
  jobs: {
    total: number;
    byStatus: Record<ModerationStatus, number>;
    draft: number;
    pending: number;
    approved: number;
    rejected: number;
    paused: number;
    expired: number;
    createdLast7Days: number;
    createdLast30Days: number;
  };
  applications: {
    total: number;
    byStatus: Record<ApplicationStatus, number>;
    submitted: number;
    reviewing: number;
    interview: number;
    offered: number;
    rejected: number;
    withdrawn: number;
    createdLast7Days: number;
    createdLast30Days: number;
  };
  companies: {
    total: number;
    verified: number;
    unverified: number;
    createdLast30Days: number;
  };
  reports: {
    total: number;
    byStatus: Record<ReportStatus, number>;
    open: number;
    reviewed: number;
    dismissed: number;
    createdLast7Days: number;
    createdLast30Days: number;
  };
  messages: {
    total: number;
    createdLast7Days: number;
    createdLast30Days: number;
  };
}

export type AdminAnalyticsResult =
  | { status: "ok"; analytics: AdminAnalytics }
  | { status: "unavailable" | "error" };

export async function getAdminAnalytics(
  referenceDate = new Date(),
): Promise<AdminAnalyticsResult> {
  if (!isSupabaseConfigured()) return { status: "unavailable" };

  const last7Days = daysAgoIso(referenceDate, 7);
  const last30Days = daysAgoIso(referenceDate, 30);

  try {
    const supabase = await createSupabaseServerClient();
    const [
      jobStatusCounts,
      jobTotal,
      jobsLast7Days,
      jobsLast30Days,
      applicationStatusCounts,
      applicationTotal,
      applicationsLast7Days,
      applicationsLast30Days,
      companyTotal,
      verifiedCompanies,
      unverifiedCompanies,
      companiesLast30Days,
      reportStatusCounts,
      reportTotal,
      reportsLast7Days,
      reportsLast30Days,
      messageTotal,
      messagesLast7Days,
      messagesLast30Days,
    ] = await Promise.all([
      countByValues(supabase, "jobs", "moderation_status", MODERATION_STATUSES),
      exactCount(supabase, "jobs"),
      exactCount(supabase, "jobs", (query) => query.gte("created_at", last7Days)),
      exactCount(supabase, "jobs", (query) => query.gte("created_at", last30Days)),
      countByValues(supabase, "applications", "status", APPLICATION_STATUSES),
      exactCount(supabase, "applications"),
      exactCount(supabase, "applications", (query) =>
        query.gte("created_at", last7Days),
      ),
      exactCount(supabase, "applications", (query) =>
        query.gte("created_at", last30Days),
      ),
      exactCount(supabase, "companies"),
      exactCount(supabase, "companies", (query) => query.eq("is_verified", true)),
      exactCount(supabase, "companies", (query) => query.eq("is_verified", false)),
      exactCount(supabase, "companies", (query) =>
        query.gte("created_at", last30Days),
      ),
      countByValues(supabase, "reports", "status", REPORT_STATUSES),
      exactCount(supabase, "reports"),
      exactCount(supabase, "reports", (query) => query.gte("created_at", last7Days)),
      exactCount(supabase, "reports", (query) =>
        query.gte("created_at", last30Days),
      ),
      exactCount(supabase, "messages"),
      exactCount(supabase, "messages", (query) =>
        query.gte("created_at", last7Days),
      ),
      exactCount(supabase, "messages", (query) =>
        query.gte("created_at", last30Days),
      ),
    ]);

    return {
      status: "ok",
      analytics: {
        jobs: {
          total: jobTotal,
          byStatus: jobStatusCounts,
          draft: jobStatusCounts.draft,
          pending: jobStatusCounts.pending,
          approved: jobStatusCounts.approved,
          rejected: jobStatusCounts.rejected,
          paused: jobStatusCounts.paused,
          expired: jobStatusCounts.expired,
          createdLast7Days: jobsLast7Days,
          createdLast30Days: jobsLast30Days,
        },
        applications: {
          total: applicationTotal,
          byStatus: applicationStatusCounts,
          submitted: applicationStatusCounts.submitted,
          reviewing: applicationStatusCounts.reviewing,
          interview: applicationStatusCounts.interview,
          offered: applicationStatusCounts.offered,
          rejected: applicationStatusCounts.rejected,
          withdrawn: applicationStatusCounts.withdrawn,
          createdLast7Days: applicationsLast7Days,
          createdLast30Days: applicationsLast30Days,
        },
        companies: {
          total: companyTotal,
          verified: verifiedCompanies,
          unverified: unverifiedCompanies,
          createdLast30Days: companiesLast30Days,
        },
        reports: {
          total: reportTotal,
          byStatus: reportStatusCounts,
          open: reportStatusCounts.open,
          reviewed: reportStatusCounts.reviewed,
          dismissed: reportStatusCounts.dismissed,
          createdLast7Days: reportsLast7Days,
          createdLast30Days: reportsLast30Days,
        },
        messages: {
          total: messageTotal,
          createdLast7Days: messagesLast7Days,
          createdLast30Days: messagesLast30Days,
        },
      },
    };
  } catch {
    console.error("[db] getAdminAnalytics failed");
    return { status: "error" };
  }
}

async function exactCount(
  supabase: AnalyticsClient,
  table: string,
  filter: CountFilter = (query) => query,
): Promise<number> {
  const query = filter(
    supabase
      .from(table)
      .select("id", { count: "exact", head: true }) as unknown as CountBuilder,
  );
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countByValues<T extends string>(
  supabase: AnalyticsClient,
  table: string,
  column: string,
  values: readonly T[],
): Promise<Record<T, number>> {
  const entries = await Promise.all(
    values.map(async (value) => [
      value,
      await exactCount(supabase, table, (query) => query.eq(column, value)),
    ] as const),
  );
  return Object.fromEntries(entries) as Record<T, number>;
}

function daysAgoIso(referenceDate: Date, days: number): string {
  return new Date(referenceDate.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
