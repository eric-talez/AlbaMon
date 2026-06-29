import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getEmployerApplications } from "@/lib/db/applications";
import { ApplicationStatusControl } from "@/components/applications/ApplicationStatusControl";
import { APPLICATION_STATUS_LABELS } from "@/lib/types";
import { updateEmployerApplicationStatus } from "./actions";

export const metadata: Metadata = { title: "지원자 목록" };

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string): string {
  return (
    APPLICATION_STATUS_LABELS[status as keyof typeof APPLICATION_STATUS_LABELS] ??
    status
  );
}

export default async function EmployerApplicationsPage() {
  await requireRole("employer", "/employer/applications");
  const result = await getEmployerApplications();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US 고용주</p>
      <h1 className="mt-1 text-2xl font-bold">지원자 목록</h1>
      <p className="mt-2 text-sm text-muted">
        본인이 소유한 회사의 채용 공고에 제출된 지원서만 표시됩니다.
      </p>

      {result.status === "unavailable" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">지원자 목록을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            현재 환경에 Supabase가 연결되지 않아 실제 지원서를 불러올 수 없습니다.
            Mock 지원서는 표시하지 않습니다.
          </p>
        </section>
      ) : result.status === "error" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">지원자 목록을 불러오지 못했습니다.</h2>
          <p className="mt-2 text-sm text-muted">잠시 후 다시 시도해 주세요.</p>
        </section>
      ) : result.applications.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">아직 접수된 지원서가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            본인 회사의 공고에 지원서가 제출되면 이곳에 표시됩니다.
          </p>
        </section>
      ) : (
        <ul className="mt-6 space-y-4">
          {result.applications.map((application) => (
            <li key={application.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-muted">{application.companyName}</p>
                  <h2 className="mt-1 text-lg font-semibold">{application.jobTitle}</h2>
                  <div className="mt-3 space-y-1 text-sm">
                    <p>
                      <span className="font-medium">지원자:</span>{" "}
                      {application.applicantDisplayName ?? "이름 미입력"}
                    </p>
                    <p>
                      <span className="font-medium">이메일:</span>{" "}
                      {application.applicantEmail ?? "이메일 없음"}
                    </p>
                  </div>
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

              <ApplicationStatusControl
                applicationId={application.id}
                currentStatus={application.status}
                updateAction={updateEmployerApplicationStatus}
              />

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
                  href={`/employer/applications/${encodeURIComponent(application.id)}/messages`}
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
