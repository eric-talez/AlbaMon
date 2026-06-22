import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getEmployerCompanies } from "@/lib/db/companies";
import { JobForm } from "./JobForm";

export const metadata: Metadata = { title: "공고 등록" };

export default async function NewJobPage() {
  const user = await requireRole("employer", "/employer/jobs/new");
  const result = await getEmployerCompanies(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US 고용주</p>
      <h1 className="mt-1 text-2xl font-bold">공고 등록</h1>
      <p className="mt-2 text-sm text-muted">제출된 공고는 검토 대기 상태로 저장되며 자동 게시되지 않습니다.</p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">공고 등록을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 공고를 등록할 수 있습니다."
              : "회사 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.companies.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">먼저 회사 정보를 등록해 주세요.</h2>
          <p className="mt-2 text-sm text-muted">소유한 회사가 확인되어야 공고를 제출할 수 있습니다.</p>
          <Link href="/employer/company" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">회사 정보 등록</Link>
        </section>
      ) : (
        <JobForm companies={result.companies} />
      )}
    </main>
  );
}
