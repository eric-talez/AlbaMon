import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import {
  getAdminEmployerAccessRequests,
  type AdminEmployerAccessRequest,
} from "@/lib/db/employer-access-requests";
import { EMPLOYER_ACCESS_REQUEST_STATUS_LABELS } from "@/lib/types";
import { EmployerRequestReviewForm } from "./EmployerRequestReviewForm";

export const metadata: Metadata = { title: "고용주 권한 요청 큐" };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function RequestCard({ request }: { request: AdminEmployerAccessRequest }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{request.businessName}</h2>
          <p className="mt-1 text-sm text-muted">
            {request.city}, {request.state}
          </p>
          <p className="mt-2 text-xs text-muted">접수일 {formatDate(request.createdAt)}</p>
        </div>
        <span className="inline-flex self-start rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          {EMPLOYER_ACCESS_REQUEST_STATUS_LABELS[request.status]}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 rounded-lg bg-background p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">담당자</dt>
          <dd className="font-medium">{request.contactName}</dd>
        </div>
        <div>
          <dt className="text-muted">전화번호</dt>
          <dd className="font-medium">{request.phone ?? "전화번호 없음"}</dd>
        </div>
        <div>
          <dt className="text-muted">웹사이트</dt>
          <dd className="break-all font-medium">{request.website ?? "웹사이트 없음"}</dd>
        </div>
        <div>
          <dt className="text-muted">요청자</dt>
          <dd className="font-medium">
            {request.requesterDisplayName ?? "이름 정보 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">요청자 이메일</dt>
          <dd className="break-all font-medium">
            {request.requesterEmail ?? "이메일 정보 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">검토일</dt>
          <dd className="font-medium">
            {request.reviewedAt ? formatDate(request.reviewedAt) : "검토 전"}
          </dd>
        </div>
      </dl>

      {request.reason ? (
        <section className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">요청 사유</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
            {request.reason}
          </p>
        </section>
      ) : null}

      <EmployerRequestReviewForm
        requestId={request.id}
        disabled={request.status !== "pending"}
      />
    </li>
  );
}

export default async function AdminEmployerRequestsPage() {
  await requireRole("admin", "/admin/employer-requests");
  const result = await getAdminEmployerAccessRequests();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
        ← 관리자 콘솔
      </Link>
      <h1 className="mt-4 text-2xl font-bold">고용주 권한 요청 큐</h1>
      <p className="mt-2 text-sm text-muted">
        구직자 계정이 제출한 고용주 권한 요청을 검토합니다. 승인 시 요청자
        프로필이 고용주 권한으로 전환되고, 반려 시 권한은 변경되지 않습니다.
        회사 정보 등록은 승인 후 요청자가 직접 진행합니다.
      </p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">요청 큐를 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서만 실제 요청 큐를 확인할 수 있습니다."
              : "요청 큐를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.requests.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">접수된 요청이 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            새 요청이 접수되면 검토 대기 건이 먼저, 최신순으로 표시됩니다.
          </p>
        </section>
      ) : (
        <ul className="mt-6 space-y-5">
          {result.requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </ul>
      )}
    </main>
  );
}
