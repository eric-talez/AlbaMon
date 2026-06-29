import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminJobs, type AdminJob } from "@/lib/db/admin-moderation";
import {
  formatPayRange,
  JOB_CATEGORY_LABELS,
  JOB_TYPE_LABELS,
  LANGUAGE_REQUIREMENT_LABELS,
  MODERATION_STATUS_LABELS,
} from "@/lib/types";
import { JobModerationForm } from "./JobModerationForm";

export const metadata: Metadata = { title: "공고 검토" };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
      </ul>
    </section>
  );
}

const COMPLIANCE_CATEGORY_LABELS = {
  discrimination: "Discrimination / 차별 표현",
  work_authorization: "Work authorization / 근로 자격",
  cash_pay: "Cash or tax wording / 현금·세금 표현",
  unpaid_labor: "Unpaid labor / 무급 노동",
  misleading_pay: "Pay claim / 급여 표현",
} as const;

function JobCard({ job }: { job: AdminJob }) {
  const location = job.addressDisplayMode === "full" && job.addressDisplay
    ? `${job.addressDisplay}, ${job.city}, ${job.state}`
    : `${job.city}, ${job.state}`;
  return (
    <li className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted">{job.companyName}</p>
          <h2 className="mt-1 text-xl font-semibold">{job.title}</h2>
          <p className="mt-2 text-xs text-muted">제출일 {formatDate(job.createdAt)}</p>
        </div>
        <span className="inline-flex self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          {MODERATION_STATUS_LABELS[job.moderationStatus]}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 rounded-lg bg-background p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">직종 / 고용 형태</dt><dd className="font-medium">{JOB_CATEGORY_LABELS[job.category]} · {JOB_TYPE_LABELS[job.jobType]}</dd></div>
        <div><dt className="text-muted">근무지</dt><dd className="font-medium">{location}</dd></div>
        <div><dt className="text-muted">급여</dt><dd className="font-medium">{formatPayRange(job.payMin, job.payMax, job.payUnit)}{job.tipsAvailable ? " · 팁 별도" : ""}</dd></div>
        <div><dt className="text-muted">일정</dt><dd className="font-medium">{job.scheduleDays} · {job.scheduleTimeRange}</dd></div>
        <div className="sm:col-span-2"><dt className="text-muted">언어 요건</dt><dd className="font-medium">{LANGUAGE_REQUIREMENT_LABELS[job.languageRequirement]}</dd></div>
      </dl>

      <div className="mt-5 space-y-5">
        <section>
          <h3 className="text-sm font-semibold">상세 설명</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{job.description}</p>
        </section>
        <DetailList title="담당 업무" items={job.responsibilities} />
        <DetailList title="자격 요건" items={job.requirements} />
        <DetailList title="복리후생" items={job.benefits} />
      </div>

      {job.complianceFlags.length > 0 ? (
        <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <h3 className="font-semibold text-warning">
            Compliance review flag / 컴플라이언스 검토 플래그
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            This listing may contain language that requires closer review. A flag
            is not a legal determination.
          </p>
          <ul className="mt-3 space-y-2">
            {job.complianceFlags.map((flag) => (
              <li key={`${flag.category}-${flag.phrase}`}>
                <span className="font-medium">
                  {COMPLIANCE_CATEGORY_LABELS[flag.category]}:
                </span>{" "}
                <span className="font-mono text-xs">{flag.phrase}</span>
                <span className="block text-xs text-muted">{flag.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.moderationStatus === "pending" ? (
        <JobModerationForm jobId={job.id} />
      ) : null}
    </li>
  );
}

export default async function AdminJobsPage() {
  await requireRole("admin", "/admin/jobs");
  const result = await getAdminJobs();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand hover:underline">← 관리자 콘솔</Link>
      <h1 className="mt-4 text-2xl font-bold">공고 검토</h1>
      <p className="mt-2 text-sm text-muted">대기 중인 공고를 먼저 검토하고 승인 또는 반려합니다.</p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">공고 목록을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 공고를 검토할 수 있습니다."
              : "공고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.jobs.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">등록된 공고가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">새 공고가 제출되면 이곳에 표시됩니다.</p>
        </section>
      ) : (
        <ul className="mt-6 space-y-5">
          {result.jobs.map((job) => <JobCard key={job.id} job={job} />)}
        </ul>
      )}
    </main>
  );
}
