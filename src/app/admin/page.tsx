import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminModerationCounts } from "@/lib/db/admin-moderation";
import { getPendingEmployerAccessRequestCount } from "@/lib/db/employer-access-requests";

export const metadata: Metadata = { title: "Admin console / 관리자 콘솔" };

export default async function AdminHomePage() {
  await requireRole("admin", "/admin");
  const [result, employerRequests] = await Promise.all([
    getAdminModerationCounts(),
    getPendingEmployerAccessRequestCount(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US admin</p>
      <h1 className="mt-1 text-2xl font-bold">Admin console / 관리자 콘솔</h1>
      <p className="mt-2 text-muted">
        Review pending jobs, company verification, reports, and marketplace
        health metrics.
      </p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">Admin queues are unavailable.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서만 실제 관리자 현황을 확인할 수 있습니다."
              : "관리자 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/jobs"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Pending jobs / 검토 대기 공고</p>
            <p className="mt-2 text-3xl font-bold">{result.counts.pendingJobs}</p>
            <p className="mt-3 text-sm font-medium text-brand">Review jobs</p>
          </Link>
          <Link
            href="/admin/companies"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Unverified companies / 미인증 회사</p>
            <p className="mt-2 text-3xl font-bold">
              {result.counts.unverifiedCompanies}
            </p>
            <p className="mt-3 text-sm font-medium text-brand">Manage companies</p>
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Open reports / 열린 신고</p>
            <p className="mt-2 text-3xl font-bold">{result.counts.openReports}</p>
            <p className="mt-3 text-sm font-medium text-brand">Review reports</p>
          </Link>
          <Link
            href="/admin/employer-requests"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Employer requests / 고용주 권한 요청</p>
            <p className="mt-2 text-3xl font-bold">
              {employerRequests.status === "ok" ? employerRequests.count : "—"}
            </p>
            <p className="mt-3 text-sm font-medium text-brand">Review requests</p>
          </Link>
          <Link
            href="/admin/analytics"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Analytics / KPI dashboard</p>
            <p className="mt-2 text-3xl font-bold">KPI</p>
            <p className="mt-3 text-sm font-medium text-brand">View metrics</p>
          </Link>
        </div>
      )}
    </main>
  );
}
