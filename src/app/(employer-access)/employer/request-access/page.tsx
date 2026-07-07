import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { AccountBar } from "@/components/auth/AccountBar";
import { getLatestEmployerAccessRequest } from "@/lib/db/employer-access-requests";
import { EMPLOYER_ACCESS_REQUEST_STATUS_LABELS } from "@/lib/types";
import { RequestAccessForm } from "./RequestAccessForm";

// Lives in the (employer-access) route group so it does NOT inherit the
// employer layout's role guard — seekers must be able to reach this page.
// Auth-gated: depends on the request session, so never statically prerender.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "고용주 권한 요청" };

const REVIEW_NOTES = [
  "공고 등록은 관리자 검토와 승인 이후에만 가능합니다. Admin review is required before you can post jobs.",
  "요청 제출이 승인을 보장하지 않습니다. Submitting a request does not guarantee approval.",
  "K-Work US는 사업자 등록, 법적 자격, 근로 자격(work authorization)을 확인하거나 보증하지 않습니다. K-Work US does not verify or guarantee business registration, legal status, or work authorization.",
] as const;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

export default async function EmployerRequestAccessPage() {
  const user = await requireUser("/employer/request-access");

  if (user.role !== "seeker") {
    return (
      <div className="flex min-h-full flex-col">
        <AccountBar user={user} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
          <h1 className="text-2xl font-bold">고용주 권한 요청</h1>
          <section
            className="mt-6 rounded-xl border border-brand/30 bg-brand-soft p-5"
            role="status"
          >
            <h2 className="font-semibold">
              이미 고용주 기능을 사용할 수 있습니다. / You already have employer access.
            </h2>
            <p className="mt-2 text-sm text-muted">
              별도의 요청 없이 고용주 콘솔에서 회사 정보와 공고를 관리할 수 있습니다.
            </p>
            <Link
              href="/employer"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-brand-foreground hover:opacity-90"
            >
              고용주 콘솔로 이동
            </Link>
          </section>
        </main>
      </div>
    );
  }

  const result = await getLatestEmployerAccessRequest(user.id);
  const latest = result.status === "ok" ? result.request : null;
  const hasPendingRequest = latest?.status === "pending";
  const hasRejectedRequest = latest?.status === "rejected";

  return (
    <div className="flex min-h-full flex-col">
      <AccountBar user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <p className="text-xs font-medium text-brand">K-Work US</p>
        <h1 className="mt-1 text-2xl font-bold">
          고용주 권한 요청 / Request employer access
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          회사 정보 등록과 공고 제출은 고용주 계정에서만 가능합니다. 아래 정보를
          제출하면 관리자가 검토 후 고용주 권한을 부여할지 결정합니다.
        </p>

        <section className="mt-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">검토 안내 / Review notes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
            {REVIEW_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        {result.status === "unavailable" ? (
          <section
            className="mt-6 rounded-xl border border-border bg-surface p-5"
            role="alert"
          >
            <h2 className="font-semibold">지금은 요청을 접수할 수 없습니다.</h2>
            <p className="mt-2 text-sm text-muted">
              고용주 권한 요청은 Supabase가 연결된 환경에서 사용할 수 있습니다.
              운영 환경 설정이 완료되면 다시 시도해 주세요.
            </p>
          </section>
        ) : result.status === "error" ? (
          <section
            className="mt-6 rounded-xl border border-border bg-surface p-5"
            role="alert"
          >
            <h2 className="font-semibold">요청 상태를 불러오지 못했습니다.</h2>
            <p className="mt-2 text-sm text-muted">
              잠시 후 페이지를 새로 고침한 뒤 다시 시도해 주세요.
            </p>
          </section>
        ) : hasPendingRequest ? (
          <section
            className="mt-6 rounded-xl border border-brand/30 bg-brand-soft p-5"
            role="status"
          >
            <h2 className="font-semibold">
              요청이 검토 대기 중입니다. / Your request is pending review.
            </h2>
            <p className="mt-2 text-sm text-muted">
              {latest
                ? `${latest.businessName} · ${formatDate(latest.createdAt)} 접수 · ${EMPLOYER_ACCESS_REQUEST_STATUS_LABELS[latest.status]}`
                : null}
            </p>
            <p className="mt-2 text-sm text-muted">
              관리자 검토가 끝나면 이 페이지에서 결과를 확인할 수 있습니다. 새
              요청을 추가로 제출할 필요는 없습니다.
            </p>
          </section>
        ) : (
          <>
            {hasRejectedRequest && latest ? (
              <section
                className="mt-6 rounded-xl border border-danger/30 bg-danger/5 p-5"
                role="status"
              >
                <h2 className="font-semibold">
                  이전 요청이 반려되었습니다. / Your previous request was rejected.
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {`${latest.businessName} · ${formatDate(latest.createdAt)} 접수 · ${EMPLOYER_ACCESS_REQUEST_STATUS_LABELS[latest.status]}`}
                </p>
                <p className="mt-2 text-sm text-muted">
                  정보를 보완해 아래에서 새 요청을 제출할 수 있습니다.
                </p>
              </section>
            ) : null}
            <RequestAccessForm />
          </>
        )}
      </main>
    </div>
  );
}
