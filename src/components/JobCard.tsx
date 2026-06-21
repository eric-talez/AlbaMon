import Link from "next/link";
import type { Job } from "@/lib/types";
import {
  formatPayRange,
  JOB_TYPE_LABELS,
  LANGUAGE_REQUIREMENT_LABELS,
  JOB_CATEGORY_LABELS,
} from "@/lib/types";
import { Badge, BoostBadge, VerifiedBadge } from "@/components/Badge";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block rounded-xl border border-border bg-background p-4 transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {job.boost && <BoostBadge boost={job.boost} />}
        <Badge tone="neutral">{JOB_TYPE_LABELS[job.jobType]}</Badge>
        <Badge tone="neutral">{JOB_CATEGORY_LABELS[job.category]}</Badge>
      </div>

      <h3 className="mt-2 text-base font-semibold leading-6 group-hover:text-brand">
        {job.title}
      </h3>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{job.companyName}</span>
        {job.employerVerified && (
          <>
            <span aria-hidden>·</span>
            <VerifiedBadge />
          </>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        <div className="flex gap-1.5">
          <dt className="text-muted">📍</dt>
          <dd>
            {job.city}, {job.state}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">💵</dt>
          <dd className="font-medium text-brand">
            {formatPayRange(job.payMin, job.payMax, job.payUnit)}
            {job.tipsAvailable && (
              <span className="ml-1 text-xs text-muted">(+팁)</span>
            )}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">🗓️</dt>
          <dd>{job.scheduleDays}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">🗣️</dt>
          <dd>{LANGUAGE_REQUIREMENT_LABELS[job.languageRequirement]}</dd>
        </div>
      </dl>
    </Link>
  );
}
