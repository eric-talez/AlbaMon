import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import {
  getAdminAnalytics,
  type AdminAnalytics,
} from "@/lib/db/admin-analytics";
import {
  APPLICATION_STATUS_LABELS,
  MODERATION_STATUS_LABELS,
  REPORT_STATUS_LABELS,
} from "@/lib/types";

export const metadata: Metadata = { title: "Admin analytics / 관리자 지표" };

interface MetricItem {
  label: string;
  value: number;
  hint?: string;
}

function MetricCard({ label, value, hint }: MetricItem) {
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("en-US")}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </article>
  );
}

function MetricGrid({ items }: { items: MetricItem[] }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <MetricCard key={item.label} {...item} />
      ))}
    </div>
  );
}

function BreakdownTable({ title, items }: { title: string; items: MetricItem[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-4 divide-y divide-border">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <dt>
              <span className="text-sm font-medium">{item.label}</span>
              {item.hint ? (
                <span className="mt-1 block text-xs text-muted">{item.hint}</span>
              ) : null}
            </dt>
            <dd className="text-lg font-semibold">
              {item.value.toLocaleString("en-US")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AnalyticsDashboard({ analytics }: { analytics: AdminAnalytics }) {
  const overview = [
    { label: "Total jobs / 전체 공고", value: analytics.jobs.total },
    {
      label: "Total applications / 전체 지원",
      value: analytics.applications.total,
    },
    { label: "Total companies / 전체 회사", value: analytics.companies.total },
    { label: "Open reports / 열린 신고", value: analytics.reports.open },
  ];

  const jobItems = [
    { label: MODERATION_STATUS_LABELS.approved, value: analytics.jobs.approved },
    { label: MODERATION_STATUS_LABELS.pending, value: analytics.jobs.pending },
    { label: MODERATION_STATUS_LABELS.rejected, value: analytics.jobs.rejected },
    { label: MODERATION_STATUS_LABELS.paused, value: analytics.jobs.paused },
    { label: MODERATION_STATUS_LABELS.expired, value: analytics.jobs.expired },
    { label: MODERATION_STATUS_LABELS.draft, value: analytics.jobs.draft },
    {
      label: "Created last 7 days",
      value: analytics.jobs.createdLast7Days,
    },
    {
      label: "Created last 30 days",
      value: analytics.jobs.createdLast30Days,
    },
  ];

  const applicationItems = [
    { label: APPLICATION_STATUS_LABELS.submitted, value: analytics.applications.submitted },
    { label: APPLICATION_STATUS_LABELS.reviewing, value: analytics.applications.reviewing },
    { label: APPLICATION_STATUS_LABELS.interview, value: analytics.applications.interview },
    { label: APPLICATION_STATUS_LABELS.offered, value: analytics.applications.offered },
    { label: APPLICATION_STATUS_LABELS.rejected, value: analytics.applications.rejected },
    { label: APPLICATION_STATUS_LABELS.withdrawn, value: analytics.applications.withdrawn },
    {
      label: "Applications last 7 days",
      value: analytics.applications.createdLast7Days,
    },
    {
      label: "Applications last 30 days",
      value: analytics.applications.createdLast30Days,
    },
  ];

  const companyItems = [
    { label: "Verified / 인증됨", value: analytics.companies.verified },
    { label: "Unverified / 미인증", value: analytics.companies.unverified },
    {
      label: "Companies created last 30 days",
      value: analytics.companies.createdLast30Days,
    },
  ];

  const reportItems = [
    { label: REPORT_STATUS_LABELS.open, value: analytics.reports.open },
    { label: REPORT_STATUS_LABELS.reviewed, value: analytics.reports.reviewed },
    { label: REPORT_STATUS_LABELS.dismissed, value: analytics.reports.dismissed },
    { label: "Reports last 7 days", value: analytics.reports.createdLast7Days },
    { label: "Reports last 30 days", value: analytics.reports.createdLast30Days },
  ];

  const messageItems = [
    { label: "Total messages / 전체 메시지", value: analytics.messages.total },
    { label: "Messages last 7 days", value: analytics.messages.createdLast7Days },
    { label: "Messages last 30 days", value: analytics.messages.createdLast30Days },
  ];

  return (
    <>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Marketplace overview</h2>
        <MetricGrid items={overview} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="Jobs" items={jobItems} />
        <BreakdownTable title="Applications" items={applicationItems} />
        <BreakdownTable title="Companies" items={companyItems} />
        <BreakdownTable title="Reports" items={reportItems} />
        <BreakdownTable title="Messages" items={messageItems} />
      </div>

      <section className="mt-6 rounded-xl border border-border p-5" aria-label="CA 게시 성과">
        <h2 className="text-lg font-semibold">CA 게시 후 7일 내 지원 / Seven-day application reach</h2>
        <p className="mt-3 text-2xl font-bold">{analytics.cohortCount === 0 ? "관찰 가능한 공고 없음" : `${(100 * analytics.appliedWithin7Days / analytics.cohortCount).toFixed(1)}%`}</p>
        <p>{analytics.appliedWithin7Days} / {analytics.cohortCount}개 공고에 유효 지원이 1개 이상 있습니다.</p>
        <dl className="mt-4 space-y-3">
          <div><dt>첫 고용주 답장 중앙값 / Median first employer reply</dt><dd className="font-semibold">{analytics.medianFirstEmployerReplyHours === null ? "답장 표본 없음 / No answered samples" : `${analytics.medianFirstEmployerReplyHours.toFixed(1)}시간 / hours`}</dd></div>
          <div><dt>답장 없는 지원 / Unanswered applications</dt><dd className="font-semibold">{analytics.unansweredApplicationCount}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">기준 시각: <time dateTime={analytics.referenceDate}>{analytics.referenceDate}</time>. 분모는 최신 게시일이 기준 시각 28일 전부터 7일 전까지(양 끝 포함)인 CA 공고입니다. 마감·만료·중지된 공고도 포함하며, 게시일을 모르는 과거 공고는 제외합니다. 같은 공고의 재게시에는 최신 게시일을 사용합니다.</p>
        <p className="mt-2 text-sm text-muted">각 공고의 최신 게시일부터 7일 후까지(양 끝 포함) 접수된 지원 중 현재 철회 상태이거나 정지된 구직자의 지원은 제외합니다. 같은 모집단의 지원별 실제 회사 소유자 답장만 지원 접수 시각부터 기준 시각까지 계산합니다. 중앙값은 답장이 있는 지원만, 무응답 수는 나머지 지원입니다. 회사 소유권 변경 기능이 생기면 과거 답장 귀속을 재검토해야 합니다.</p>
        <p className="mt-2 text-sm text-muted">CA publications in the last 28–7 days; eligible applications in each publication’s first seven days. Reply times use the first actual owner reply through the reference time. Offered는 오퍼 상태이며 채용 완료를 뜻하지 않습니다. 방문 수를 수집하지 않아 방문 대비 지원 전환율은 계산하지 않습니다.</p>
      </section>
    </>
  );
}

export default async function AdminAnalyticsPage() {
  await requireRole("admin", "/admin/analytics");
  const result = await getAdminAnalytics();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
        ← 관리자 콘솔
      </Link>
      <p className="mt-4 text-xs font-medium text-brand">K-Work US admin</p>
      <h1 className="mt-1 text-2xl font-bold">Admin analytics / 관리자 지표</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Track marketplace activity, moderation workload, applications, and
        reports. 공고, 지원, 신고, 회사 인증 현황을 한눈에 확인합니다.
      </p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">Analytics are unavailable.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서만 실제 관리자 지표를 확인할 수 있습니다."
              : "관리자 지표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : (
        <AnalyticsDashboard analytics={result.analytics} />
      )}
    </main>
  );
}
