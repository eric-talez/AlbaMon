import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatPayRange,
  JOB_TYPE_LABELS,
  JOB_CATEGORY_LABELS,
  LANGUAGE_REQUIREMENT_LABELS,
} from "@/lib/types";
import { getApprovedJobById, getApprovedJobs } from "@/lib/db/jobs";
import {
  Badge,
  CompanyVerificationBadge,
  VerifiedBadge,
} from "@/components/Badge";
import { WorkAuthorizationDisclaimer } from "@/components/WorkAuthorizationDisclaimer";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const job = await getApprovedJobById(id);
  if (!job) return { title: "공고를 찾을 수 없습니다" };
  return {
    title: `${job.title} — ${job.companyName}`,
    description: `${job.city}, ${job.state} · ${formatPayRange(
      job.payMin,
      job.payMax,
      job.payUnit,
    )} · ${job.companyName}`,
    alternates: { canonical: `/jobs/${encodeURIComponent(job.id)}` },
  };
}

export async function generateStaticParams() {
  const jobs = await getApprovedJobs();
  return jobs.map((job) => ({ id: job.id }));
}

function Section({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground/80">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const job = await getApprovedJobById(id);
  if (!job) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href="/jobs"
        className="text-sm text-muted transition-colors hover:text-brand"
      >
        ← 공고 목록
      </Link>

      <article className="mt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{JOB_TYPE_LABELS[job.jobType]}</Badge>
          <Badge tone="neutral">{JOB_CATEGORY_LABELS[job.category]}</Badge>
        </div>

        <h1 className="mt-2 text-2xl font-bold tracking-tight">{job.title}</h1>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-medium text-foreground">{job.companyName}</span>
          {job.employerVerified && <VerifiedBadge />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CompanyVerificationBadge verified={job.employerVerified} />
          <span className="text-xs text-muted">
            Company review is not a guarantee of job quality, safety, legal
            compliance, applicants, or hires.
          </span>
        </div>

        {/* Key facts */}
        <dl className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Employer-provided information</dt>
            <dd className="text-sm">
              Job information, including pay, schedule, and role details, is
              provided by the employer.
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">급여</dt>
            <dd className="text-base font-semibold text-brand">
              {formatPayRange(job.payMin, job.payMax, job.payUnit)}
              {job.tipsAvailable && (
                <span className="ml-1 text-xs font-normal text-muted">
                  (+팁 별도)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">근무지</dt>
            <dd className="text-sm">{job.addressDisplay}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">근무 요일</dt>
            <dd className="text-sm">{job.scheduleDays}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">근무 시간</dt>
            <dd className="text-sm">{job.scheduleTimeRange}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">언어 요건</dt>
            <dd className="text-sm">
              {LANGUAGE_REQUIREMENT_LABELS[job.languageRequirement]}
            </dd>
          </div>
        </dl>

        <section className="mt-6">
          <h2 className="text-base font-semibold">상세 설명</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground/80">
            {job.description}
          </p>
        </section>

        <Section title="담당 업무" items={job.responsibilities} />
        <Section title="자격 요건" items={job.requirements} />
        <Section title="복리후생" items={job.benefits} />

        <div className="mt-8">
          <WorkAuthorizationDisclaimer />
        </div>
        <p className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs leading-5 text-muted">
          K-Work US provides listing and communication tools only. K-Work US does
          not guarantee job quality, hiring outcome, legal compliance, or work
          authorization eligibility.
        </p>

        <div className="sticky bottom-20 mt-6 sm:static sm:bottom-auto">
          <Link
            href={`/jobs/${encodeURIComponent(job.id)}/apply`}
            className="flex h-12 w-full items-center justify-center rounded-full bg-brand px-6 font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            지원하기 (Apply)
          </Link>
          <p className="mt-2 text-center text-xs text-muted">
            로그인 후 간단한 지원 메모를 제출할 수 있습니다.
          </p>
          <Link
            href={`/jobs/${encodeURIComponent(job.id)}/report`}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-muted transition-colors hover:border-brand hover:text-brand"
          >
            Report this job / 신고하기
          </Link>
        </div>
      </article>
    </main>
  );
}
