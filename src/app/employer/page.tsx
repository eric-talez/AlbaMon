import type { Metadata } from "next";
import Link from "next/link";
import { requireArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "고용주 콘솔" };

const EMPLOYER_LINKS = [
  {
    href: "/employer/company",
    title: "회사 정보",
    description: "공고 등록에 사용할 회사 정보를 등록하거나 수정합니다.",
  },
  {
    href: "/employer/jobs/new",
    title: "공고 등록",
    description: "급여, 근무 일정, 언어 요건을 입력하고 검토를 요청합니다.",
  },
  {
    href: "/employer/jobs",
    title: "내 공고",
    description: "소유한 회사의 공고와 검토 상태를 확인합니다.",
  },
  {
    href: "/employer/applications",
    title: "지원자 목록",
    description: "본인 회사의 공고에 제출된 지원서만 확인합니다.",
  },
] as const;

export default async function EmployerHomePage() {
  const user = await requireArea("employer", "/employer");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">고용주 콘솔</h1>
      <p className="mt-2 text-muted">회사, 공고, 지원자를 한곳에서 관리합니다.</p>

      {user.role === "employer" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {EMPLOYER_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-border p-5 transition-colors hover:bg-surface"
            >
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-muted">{item.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <section className="mt-6 rounded-xl border border-dashed border-border p-5">
          <h2 className="font-semibold text-muted">고용주 전용 기능</h2>
          <p className="mt-1 text-sm text-muted">
            회사 등록과 공고 제출은 고용주 계정에서만 사용할 수 있습니다.
          </p>
        </section>
      )}
    </main>
  );
}
