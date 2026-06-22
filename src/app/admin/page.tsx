import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminModerationCounts } from "@/lib/db/admin-moderation";

export const metadata: Metadata = { title: "관리자 콘솔" };

export default async function AdminHomePage() {
  await requireRole("admin", "/admin");
  const result = await getAdminModerationCounts();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US 관리자</p>
      <h1 className="mt-1 text-2xl font-bold">관리자 콘솔</h1>
      <p className="mt-2 text-muted">대기 중인 공고와 회사 인증을 검토합니다.</p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">검토 현황을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 검토 현황을 확인할 수 있습니다."
              : "검토 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/jobs"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">검토 대기 공고</p>
            <p className="mt-2 text-3xl font-bold">{result.counts.pendingJobs}</p>
            <p className="mt-3 text-sm font-medium text-brand">공고 검토하기</p>
          </Link>
          <Link
            href="/admin/companies"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">미인증 회사</p>
            <p className="mt-2 text-3xl font-bold">{result.counts.unverifiedCompanies}</p>
            <p className="mt-3 text-sm font-medium text-brand">회사 인증 관리</p>
          </Link>
        </div>
      )}
    </main>
  );
}
