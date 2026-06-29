import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getApprovedJobById } from "@/lib/db/jobs";
import { ReportJobForm } from "./ReportJobForm";

type Params = { id: string };

export const metadata: Metadata = { title: "Report this job / 신고하기" };

export default async function ReportJobPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  await requireUser(`/jobs/${encodeURIComponent(id)}/report`);
  const job = await getApprovedJobById(id);
  if (!job) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href={`/jobs/${encodeURIComponent(job.id)}`}
        className="text-sm font-medium text-brand hover:underline"
      >
        ← 공고로 돌아가기 / Back to job
      </Link>

      <section className="mt-5 rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-medium text-brand">K-Work US trust</p>
        <h1 className="mt-1 text-2xl font-bold">Report this job / 신고하기</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Help us review listings that may be misleading, discriminatory, or
          suspicious. Reports help K-Work US review listings for quality and
          safety concerns. A report is not a legal determination.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          K-Work US provides listing and communication tools only and does not
          determine work authorization, immigration eligibility, wage compliance,
          or tax classification.
        </p>
        <div className="mt-4 rounded-lg bg-background p-4 text-sm">
          <p className="font-semibold">{job.title}</p>
          <p className="mt-1 text-muted">{job.companyName}</p>
        </div>
      </section>

      <ReportJobForm jobId={job.id} />
    </main>
  );
}
