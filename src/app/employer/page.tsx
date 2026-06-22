import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "고용주 콘솔" };

export default async function EmployerHomePage() {
  const user = await requireArea("employer", "/employer");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">고용주 콘솔</h1>
      <p className="mt-2 text-muted">
        공고 등록과 지원자 관리를 한곳에서 처리합니다.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/employer/jobs/new"
          className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
        >
          <h2 className="font-semibold">공고 등록</h2>
          <p className="mt-1 text-sm text-muted">
            급여 범위·근무시간을 포함해 새 공고를 작성합니다 (Slice 7).
          </p>
        </Link>
        {user.role === "employer" ? (
          <Link
            href="/employer/applications"
            className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
          >
            <h2 className="font-semibold">지원자 목록</h2>
            <p className="mt-1 text-sm text-muted">
              본인 회사의 공고에 제출된 지원서만 확인합니다.
            </p>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5">
            <h2 className="font-semibold text-muted">지원자 목록</h2>
            <p className="mt-1 text-sm text-muted">
              관리자용 지원서 관리는 이후 단계에서 제공됩니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
