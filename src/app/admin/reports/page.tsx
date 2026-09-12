import { normalizePage as adminPage } from "@/lib/pagination";
import { AdminPagination } from "../AdminPagination";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminReports, type AdminReport } from "@/lib/db/reports";
import {
  MODERATION_STATUS_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
} from "@/lib/types";
import { ReportReviewForm } from "./ReportReviewForm";

export const metadata: Metadata = { title: "신고 큐" };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function ReportCard({ report }: { report: AdminReport }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">{report.companyName}</p>
          <h2 className="mt-1 text-lg font-semibold">{report.jobTitle}</h2>
          {report.jobId && <div className="flex gap-3 text-sm text-brand"><Link href={`/jobs/${report.jobId}`}>공개 공고 보기 / Public job</Link><Link href={`/admin/jobs?status=all&job=${report.jobId}`}>관련 공고 검토 / Review job</Link></div>}
          <p className="text-sm">회사 확인: {report.companyIsVerified ? "확인됨" : "미확인"} · 공고 위험 검토와 별개</p>
          <p className="mt-2 text-xs text-muted">신고일 {formatDate(report.submittedAt)}</p>
        </div>
        <span className="inline-flex self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          {REPORT_STATUS_LABELS[report.status]}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 rounded-lg bg-background p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">신고 사유</dt>
          <dd className="font-medium">{REPORT_REASON_LABELS[report.reason]}</dd>
        </div>
        <div>
          <dt className="text-muted">공고 상태</dt>
          <dd className="font-medium">
            {report.jobModerationStatus
              ? MODERATION_STATUS_LABELS[report.jobModerationStatus]
              : "공고 상태 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">신고자</dt>
          <dd className="font-medium">
            {report.reporterDisplayName ?? "이름 정보 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">신고자 이메일</dt>
          <dd className="font-medium">{report.reporterEmail ?? "이메일 정보 없음"}</dd>
        </div>
      </dl>

      {report.details ? (
        <section className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">상세 내용</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
            {report.details}
          </p>
        </section>
      ) : null}

      <ReportReviewForm reportId={report.id} disabled={report.status !== "open"} jobUpdatedAt={report.jobUpdatedAt} canPause={report.jobModerationStatus === "approved"} />
    </li>
  );
}

export default async function AdminReportsPage({ searchParams }: { searchParams?: Promise<{ status?: string; page?: string }> } = {}) {
  await requireRole("admin", "/admin/reports");
  const params = await searchParams;
  const page = adminPage(params?.page);
  const options = ["all", "open", "reviewed", "dismissed"] as const;
  const status = options.find(value => value === params?.status) ?? "open";
  const result = await getAdminReports(page, status);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
        ← 관리자 콘솔
      </Link>
      <h1 className="mt-4 text-2xl font-bold">신고 큐</h1>
      <p className="mt-2 text-sm text-muted">
        사용자가 신고한 공고를 검토하고 처리 상태를 표시합니다.
      </p>

      <nav aria-label="상태 필터" className="mt-4 flex gap-4">{options.map(value => <Link key={value} href={`/admin/reports?status=${value}`}>{value === "all" ? "전체 / All" : REPORT_STATUS_LABELS[value]}</Link>)}</nav>
      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">신고 큐를 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서만 실제 신고 큐를 확인할 수 있습니다."
              : "신고 큐를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.reports.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">접수된 신고가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            새 신고가 접수되면 이곳에 오래된 접수순으로 표시됩니다.
          </p>
        </section>
      ) : (
        <ul className="mt-6 space-y-5">
          {result.reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </ul>
      )}
      {result.status === "ok" && <AdminPagination page={page} count={result.reports.length} href={`/admin/reports?status=${status}`} />}
    </main>
  );
}
