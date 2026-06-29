import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getEmployerJobs } from "@/lib/db/employer-jobs";
import { MODERATION_STATUS_LABELS } from "@/lib/types";
import { Badge, BoostBadge } from "@/components/Badge";

export const metadata: Metadata = { title: "내 공고" };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

export default async function EmployerJobsPage() {
  const user = await requireRole("employer", "/employer/jobs");
  const result = await getEmployerJobs(user.id);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand">K-Work US 고용주</p>
          <h1 className="mt-1 text-2xl font-bold">내 공고</h1>
        </div>
        <Link href="/employer/jobs/new" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">새 공고 등록</Link>
      </div>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">공고 목록을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 공고를 확인할 수 있습니다."
              : "공고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.jobs.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">아직 등록한 공고가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">첫 공고를 검토 요청으로 제출해 보세요.</p>
        </section>
      ) : (
        <ul className="mt-6 space-y-4">
          {result.jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-muted">{job.companyName}</p>
                  <h2 className="mt-1 text-lg font-semibold">{job.title}</h2>
                  <p className="mt-2 text-xs text-muted">등록일 {formatDate(job.createdAt)}</p>
                </div>
                <span className="inline-flex self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                  {MODERATION_STATUS_LABELS[job.moderationStatus]}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
                {job.boost ? (
                  <BoostBadge boost={job.boost} />
                ) : (
                  <Badge tone="neutral">No boost</Badge>
                )}
                <Link href={`/employer/jobs/${encodeURIComponent(job.id)}/boost`} className="font-medium text-brand hover:underline">Boost this job</Link>
                {job.moderationStatus === "approved" ? (
                  <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="font-medium text-brand hover:underline">공개 공고 보기</Link>
                ) : (
                  <span className="text-muted">승인 전에는 공개되지 않습니다.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
