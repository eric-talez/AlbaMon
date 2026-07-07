import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/types";
import { roleHome } from "@/lib/auth/access";

export const metadata: Metadata = { title: "접근 권한 없음" };

/** Shown when a signed-in user lacks the role for a route (wrong-role state). */
export default async function ForbiddenPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="inline-block rounded-full bg-danger/10 px-3 py-1 text-sm font-medium text-danger">
        접근 권한 없음 · Forbidden
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        이 페이지에 접근할 수 없습니다
      </h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-muted">
        {user
          ? `현재 ${ROLE_LABELS[user.role]} 권한으로는 이 페이지를 볼 수 없습니다. 권한이 있는 페이지로 이동해 주세요.`
          : "로그인이 필요합니다."}
      </p>
      {user?.role === "seeker" ? (
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">
          고용주 기능이 필요하신가요?{" "}
          <Link
            href="/employer/request-access"
            className="font-medium text-brand hover:underline"
          >
            고용주 권한 요청 / Request employer access
          </Link>
        </p>
      ) : null}
      <div className="mt-8 flex gap-3">
        <Link
          href={user ? roleHome(user.role) : "/login"}
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-6 font-medium text-brand-foreground hover:opacity-90"
        >
          {user ? "내 페이지로" : "로그인"}
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full border border-border px-6 font-medium hover:bg-surface"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
