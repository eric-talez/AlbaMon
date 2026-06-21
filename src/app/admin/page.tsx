import type { Metadata } from "next";

export const metadata: Metadata = { title: "관리자 콘솔" };

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">관리자 콘솔</h1>
      <p className="mt-2 text-muted">
        공고 검수와 신고 처리 등 운영 기능이 제공됩니다.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-border p-5">
          <h2 className="font-semibold text-muted">공고 검수 큐</h2>
          <p className="mt-1 text-sm text-muted">
            대기 중인 공고 승인·반려와 위험 키워드 검토 (Slice 9).
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border p-5">
          <h2 className="font-semibold text-muted">신고 / 신뢰 관리</h2>
          <p className="mt-1 text-sm text-muted">
            신고 처리 및 고용주 인증 관리 (Slice 11).
          </p>
        </div>
      </div>
    </main>
  );
}
