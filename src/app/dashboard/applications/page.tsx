import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getSeekerApplications } from "@/lib/db/applications";

export const metadata: Metadata = { title: "내 지원 내역" };

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string): string {
  return status === "submitted" ? "제출됨 (Submitted)" : status;
}

export default async function SeekerApplicationsPage() {
  await requireRole("seeker", "/dashboard/applications");
  const result = await getSeekerApplications();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US 지원 관리</p>
      <h1 className="mt-1 text-2xl font-bold">내 지원 내역</h1>
      <p className="mt-2 text-sm text-muted">
        제출한 지원서와 현재 상태를 확인할 수 있습니다.
      </p>

      {result.status === "unavailable" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">지원 내역을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            현재 환경에 Supabase가 연결되지 않아 실제 지원 내역을 불러올 수 없습니다.
            Mock 지원 내역은 표시하지 않습니다.
          </p>
        </section>
      ) : result.status === "error" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">지원 내역을 불러오지 못했습니다.</h2>
          <p className="mt-2 text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
        </section>
      ) : result.applications.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">아직 제출한 지원서가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">관심 있는 LA/OC 채용 공고를 찾아보세요.</p>
          <Link href="/jobs" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
            채용 공고 보기
          </Link>
        </section>
      ) : (
        <ul className="mt-6 space-y-4">
          {result.applications.map((application) => (
            <li key={application.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-muted">{application.companyName}</p>
                  <h2 className="mt-1 text-lg font-semibold">{application.jobTitle}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {application.city}, {application.state}
                  </p>
                </div>
                <div className="sm:text-right">
                  <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                    {statusLabel(application.status)}
                  </span>
                  <p className="mt-2 text-xs text-muted">
                    제출일 {formatSubmittedAt(application.submittedAt)}
                  </p>
                </div>
              </div>

              {application.coverNote ? (
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">지원 메모</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                    {application.coverNote}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
                {application.jobIsPublic ? (
                  <Link
                    href={`/jobs/${encodeURIComponent(application.jobId)}`}
                    className="font-medium text-brand hover:underline"
                  >
                    공고 상세 보기
                  </Link>
                ) : (
                  <span className="text-muted">현재 공개되지 않은 공고입니다.</span>
                )}
                <Link
                  href={`/dashboard/applications/${encodeURIComponent(application.id)}/messages`}
                  className="font-medium text-brand hover:underline"
                >
                  메시지
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
