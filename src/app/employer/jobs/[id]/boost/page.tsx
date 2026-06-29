import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, BoostBadge } from "@/components/Badge";
import { requireArea } from "@/lib/auth/guards";
import { getOwnedBoostJob } from "@/lib/payments/boosts";
import { isStripeCheckoutConfigured } from "@/lib/payments/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BOOST_LABELS, type BoostType } from "@/lib/types";
import { startBoostCheckout } from "./actions";

export const metadata: Metadata = { title: "Boost this job" };

type Params = { id: string };
type SearchParams = { checkout?: string | string[] };

const BOOST_OPTIONS: { type: BoostType; label: string; description: string }[] = [
  {
    type: "featured",
    label: "Featured / 추천 공고",
    description: "Adds visual emphasis to the listing where boosts are shown.",
  },
  {
    type: "urgent",
    label: "Urgent / 긴급",
    description: "Shows an urgent badge on public job cards and details.",
  },
];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Notice({ status }: { status: string | undefined }) {
  if (status === "success") {
    return (
      <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-success dark:border-green-900 dark:bg-green-950/30">
        Payment received. Your boost will appear after confirmation.
        <br />
        결제가 확인되면 부스트가 반영됩니다.
      </div>
    );
  }
  if (status === "cancel") {
    return (
      <div className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Checkout was canceled. No boost was activated.
      </div>
    );
  }
  if (status && status !== "success") {
    return (
      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger dark:border-red-900 dark:bg-red-950/30">
        Payments are not available for this request. Please check the job and
        payment configuration.
      </div>
    );
  }
  return null;
}

export default async function EmployerJobBoostPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const user = await requireArea("employer", `/employer/jobs/${id}/boost`);
  const checkout = first((await searchParams).checkout);

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Link href="/employer/jobs" className="text-sm text-muted hover:text-brand">
          Back to employer jobs
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Boost this job / 공고 부스트</h1>
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">Payments are not configured in this environment.</h2>
          <p className="mt-2 text-sm text-muted">
            이 환경에서는 결제가 설정되어 있지 않습니다.
          </p>
        </section>
      </main>
    );
  }

  let job;
  try {
    job = await getOwnedBoostJob(user.id, id);
  } catch {
    job = null;
  }
  if (!job) notFound();

  const anyCheckoutConfigured = BOOST_OPTIONS.some((option) =>
    isStripeCheckoutConfigured(option.type),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/employer/jobs" className="text-sm text-muted hover:text-brand">
        Back to employer jobs
      </Link>
      <p className="mt-5 text-xs font-medium text-brand">K-Work US employer</p>
      <h1 className="mt-1 text-2xl font-bold">Boost this job / 공고 부스트</h1>
      <p className="mt-2 text-sm text-muted">
        Choose a visibility boost for this listing. Boosts may improve placement
        or visual emphasis, but they do not guarantee applicants or hires.
      </p>

      <Notice status={checkout} />

      <section className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted">{job.companyName}</p>
            <h2 className="mt-1 text-lg font-semibold">{job.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{job.moderationStatus}</Badge>
            {job.boost ? (
              <BoostBadge boost={job.boost} />
            ) : (
              <Badge tone="neutral">No active boost</Badge>
            )}
          </div>
        </div>
      </section>

      {!anyCheckoutConfigured ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">Payments are not configured in this environment.</h2>
          <p className="mt-2 text-sm text-muted">
            이 환경에서는 결제가 설정되어 있지 않습니다.
          </p>
        </section>
      ) : (
        <form action={startBoostCheckout} className="mt-6 space-y-4">
          <input type="hidden" name="jobId" value={job.id} />
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Boost type</legend>
            {BOOST_OPTIONS.map((option) => {
              const configured = isStripeCheckoutConfigured(option.type);
              return (
                <label
                  key={option.type}
                  className="flex cursor-pointer gap-3 rounded-xl border border-border bg-background p-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                >
                  <input
                    type="radio"
                    name="boostType"
                    value={option.type}
                    required
                    disabled={!configured}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {option.description}
                    </span>
                    <span className="mt-2 block text-xs text-muted">
                      Price: {configured ? "configured in Stripe" : "not configured"}
                      {job.boost === option.type
                        ? ` · currently ${BOOST_LABELS[option.type]}`
                        : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="text-xs text-muted">
            Boosts improve listing visibility but do not guarantee applicants,
            hires, job quality, legal approval, or safety.
          </p>
          <button
            type="submit"
            className="h-11 rounded-full bg-brand px-5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            Continue to payment
          </button>
        </form>
      )}
    </main>
  );
}
