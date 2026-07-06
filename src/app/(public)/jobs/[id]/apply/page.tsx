import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getApprovedJobById } from "@/lib/db/jobs";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { WorkAuthorizationDisclaimer } from "@/components/WorkAuthorizationDisclaimer";
import { ApplicationForm } from "./ApplicationForm";

type Params = { id: string };

// Signed-in user flow — never index.
export const metadata: Metadata = {
  title: "지원하기 (Apply)",
  robots: { index: false },
};

export default async function ApplyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const job = await getApprovedJobById(id);
  if (!job) notFound();

  const applyPath = `/jobs/${encodeURIComponent(id)}/apply`;
  const user = await requireUser(applyPath);
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link
        href={`/jobs/${encodeURIComponent(id)}`}
        className="text-sm text-muted transition-colors hover:text-brand"
      >
        ← 공고로 돌아가기
      </Link>

      <section className="mt-4 rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium text-brand">K-Work US 지원</p>
        <h1 className="mt-1 text-2xl font-bold">{job.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {job.companyName} · {job.city}, {job.state}
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-background p-5">
        {user.role !== "seeker" ? (
          <div role="alert">
            <h2 className="font-semibold">이 계정으로는 지원할 수 없습니다.</h2>
            <p className="mt-2 text-sm text-muted">
              구직자(Seeker) 계정만 채용 공고에 지원할 수 있습니다. 고용주 및
              관리자 계정의 지원은 차단됩니다.
            </p>
          </div>
        ) : !configured ? (
          <div role="alert">
            <h2 className="font-semibold">지원 기능을 사용할 수 없습니다.</h2>
            <p className="mt-2 text-sm text-muted">
              현재 로컬 환경에 Supabase가 연결되지 않아 실제 지원서는 제출되지
              않습니다. Mock 지원서는 생성하지 않습니다.
            </p>
          </div>
        ) : (
          <ApplicationForm jobId={id} />
        )}
      </section>

      <div className="mt-6">
        <WorkAuthorizationDisclaimer />
      </div>
    </main>
  );
}
