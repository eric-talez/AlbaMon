import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import {
  getAdminQueueCounts,
  type AdminQueueCountResult,
} from "@/lib/db/admin-moderation";
import { getPendingEmployerAccessRequestCount } from "@/lib/db/employer-access-requests";
import { getRecentAdminAuditLogs } from "@/lib/db/audit-logs";
import {
  buildHealthReport,
  type HealthCheckStatus,
  type HealthChecks,
} from "@/lib/ops/health";
import { Badge } from "@/components/Badge";

export const metadata: Metadata = { title: "Admin console / 관리자 콘솔" };

const ADMIN_NAV_LINKS = [
  { href: "/admin/jobs", label: "Jobs moderation / 공고 검토" },
  { href: "/admin/companies", label: "Company verification / 회사 인증" },
  {
    href: "/admin/employer-requests",
    label: "Employer access requests / 고용주 권한 요청",
  },
  { href: "/admin/reports", label: "Reports / 신고 큐" },
  { href: "/admin/analytics", label: "Analytics / KPI dashboard" },
] as const;

const HEALTH_TONES: Record<
  HealthCheckStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  configured: "success",
  partial: "warning",
  missing: "danger",
  deferred: "neutral",
};

const HEALTH_CHECK_LABELS: Record<keyof HealthChecks, string> = {
  siteUrl: "Site URL",
  supabase: "Supabase",
  stripe: "Stripe",
  email: "Email",
  analytics: "Analytics",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function QueueCard({
  href,
  title,
  description,
  cta,
  result,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  result: AdminQueueCountResult;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
    >
      <p className="text-sm text-muted">{title}</p>
      {result.status === "ok" ? (
        <>
          <p className="mt-2 text-3xl font-bold">{result.count}</p>
          <p className="mt-1 text-xs text-muted">
            {result.count === 0
              ? "All clear / 대기 중인 항목이 없습니다"
              : description}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-3xl font-bold">—</p>
          {result.status === "unavailable" ? (
            <p className="mt-1 text-xs text-muted">
              Supabase 연결 후 표시됩니다.
            </p>
          ) : (
            <p className="mt-1 text-xs text-danger" role="alert">
              관리자 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-sm font-medium text-brand">{cta}</p>
    </Link>
  );
}

export default async function AdminHomePage() {
  await requireRole("admin", "/admin");
  const [queues, employerRequests, audit] = await Promise.all([
    getAdminQueueCounts(),
    getPendingEmployerAccessRequestCount(),
    getRecentAdminAuditLogs(),
  ]);
  // Presence only, never env values — same report the public /api/health serves.
  const health = buildHealthReport();

  const queueResults = [
    queues.pendingJobs,
    queues.unverifiedCompanies,
    queues.openReports,
    employerRequests,
  ];
  // Helpers emit "unavailable" only when Supabase is unconfigured, so
  // all-unavailable ⇔ setup mode (and dev-auth preview mode).
  const setupRequired = queueResults.every(
    (result) => result.status === "unavailable",
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US admin</p>
      <h1 className="mt-1 text-2xl font-bold">Admin console / 관리자 콘솔</h1>
      <p className="mt-2 text-muted">
        Review pending jobs, company verification, reports, and marketplace
        health metrics.
      </p>

      {setupRequired ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold">Admin setup required / 관리자 설정 필요</h2>
          <p className="mt-2 text-sm text-muted">
            Supabase가 연결된 환경에서만 실제 관리자 현황을 확인할 수 있습니다.
          </p>
          <p className="mt-2 text-sm text-muted">
            Dev auth lets an admin preview this UI, but live queue data needs a
            configured Supabase. / 개발용 로그인으로 관리자 화면을 미리 볼 수
            있지만, 실제 큐 데이터는 Supabase 연결이 필요합니다.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>
              <code>cp .env.example .env.local</code>
            </li>
            <li>
              <code>supabase start</code>
            </li>
            <li>
              <code>supabase db reset</code>
            </li>
            <li>
              Copy the local Supabase URL, anon key, and service_role key from{" "}
              <code>supabase status</code> into <code>.env.local</code> (
              <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code>).
            </li>
            <li>
              <code>npm run dev</code> — restart so the new values load.
            </li>
          </ol>
          <p className="mt-3 text-sm text-muted">
            Full walkthrough: <code>docs/LOCAL_SUPABASE.md</code>. Check{" "}
            <a href="/api/health" className="font-medium text-brand hover:underline">
              /api/health
            </a>{" "}
            first to confirm what is configured. / 자세한 단계는 문서를
            참고하고, 설정 상태는 /api/health에서 먼저 확인하세요.
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Admin tools / 관리자 도구</h2>
        <nav aria-label="Admin tools / 관리자 도구" className="mt-3">
          <ul className="flex flex-wrap gap-2">
            {ADMIN_NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-brand-soft"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="/api/health"
                className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-brand-soft"
              >
                Health check / 상태 점검
              </a>
            </li>
          </ul>
        </nav>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Queue status / 큐 현황</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QueueCard
            href="/admin/jobs"
            title="Pending jobs / 검토 대기 공고"
            description="Approve or reject submitted job posts. / 제출된 공고를 승인·반려합니다."
            cta="Review jobs"
            result={queues.pendingJobs}
          />
          <QueueCard
            href="/admin/companies"
            title="Unverified companies / 미인증 회사"
            description="Verify company details before the badge shows. / 회사 정보를 확인하고 인증합니다."
            cta="Manage companies"
            result={queues.unverifiedCompanies}
          />
          <QueueCard
            href="/admin/reports"
            title="Open reports / 열린 신고"
            description="Reports waiting for review. / 검토 대기 중인 신고입니다."
            cta="Review reports"
            result={queues.openReports}
          />
          <QueueCard
            href="/admin/employer-requests"
            title="Employer requests / 고용주 권한 요청"
            description="Seeker accounts asking for employer access. / 고용주 권한을 요청한 계정입니다."
            cta="Review requests"
            result={employerRequests}
          />
          <a
            href="/api/health"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Operational health / 운영 상태</p>
            <ul className="mt-3 space-y-1.5">
              {(
                Object.keys(HEALTH_CHECK_LABELS) as (keyof HealthChecks)[]
              ).map((check) => (
                <li
                  key={check}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>{HEALTH_CHECK_LABELS[check]}</span>
                  <Badge tone={HEALTH_TONES[health.checks[check]]}>
                    {health.checks[check]}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium text-brand">
              Open /api/health
            </p>
          </a>
          <Link
            href="/admin/analytics"
            className="rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-brand-soft"
          >
            <p className="text-sm text-muted">Analytics / KPI dashboard</p>
            <p className="mt-2 text-3xl font-bold">KPI</p>
            <p className="mt-1 text-xs text-muted">
              Marketplace KPIs and trends. / 마켓플레이스 지표입니다.
            </p>
            <p className="mt-3 text-sm font-medium text-brand">View metrics</p>
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Recent admin activity / 최근 관리자 활동
        </h2>
        {audit.status === "ok" ? (
          audit.entries.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border p-6 text-center">
              <p className="font-medium">아직 기록된 활동이 없습니다.</p>
              <p className="mt-2 text-sm text-muted">
                No admin activity recorded yet — audit writes arrive in a later
                slice.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {audit.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.action}</span>
                    <Badge tone="neutral">{entry.entityType}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDate(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="mt-3 text-sm text-muted">
            {audit.status === "unavailable"
              ? "Supabase 연결 후 관리자 활동 기록이 표시됩니다."
              : "활동 기록을 불러오지 못했습니다. 큐 카드는 계속 사용할 수 있습니다."}
          </p>
        )}
      </section>
    </main>
  );
}
