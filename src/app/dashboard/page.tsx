import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/types";
import { roleHome } from "@/lib/auth/access";

export const metadata: Metadata = { title: "대시보드" };

export default async function DashboardPage() {
  // Re-assert the guard at the page level (never trust a non-null assumption).
  const user = await requireUser("/dashboard");
  const home = roleHome(user.role);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">대시보드</h1>
      <p className="mt-2 text-muted">
        {ROLE_LABELS[user.role]} 계정으로 로그인되었습니다.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/jobs"
          className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
        >
          <h2 className="font-semibold">공고 둘러보기</h2>
          <p className="mt-1 text-sm text-muted">
            LA/OC 지역의 승인된 공고를 검색합니다.
          </p>
        </Link>

        {user.role !== "seeker" ? (
          <Link
            href={home}
            className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
          >
            <h2 className="font-semibold">
              {user.role === "admin" ? "관리자 콘솔" : "고용주 콘솔"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              역할 전용 페이지로 이동합니다.
            </p>
          </Link>
        ) : (
          <>
            <Link
              href="/dashboard/applications"
              className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
            >
              <h2 className="font-semibold">내 지원 현황</h2>
              <p className="mt-1 text-sm text-muted">
                제출한 지원서와 현재 상태를 확인합니다.
              </p>
            </Link>
            <Link
              href="/employer/request-access"
              className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
            >
              <h2 className="font-semibold">고용주 권한 요청 / Request employer access</h2>
              <p className="mt-1 text-sm text-muted">
                업체를 운영 중이신가요? 관리자 검토 후 공고를 등록할 수 있습니다.
              </p>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
