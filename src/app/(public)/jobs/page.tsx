import type { Metadata } from "next";
import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { JobFilters } from "@/components/JobFilters";
import {
  parseJobSearchParams,
  searchApprovedJobs,
} from "@/lib/db/jobs";
import { LAUNCH_MARKET } from "@/lib/site";

export const metadata: Metadata = {
  title: "공고 둘러보기",
  description: `${LAUNCH_MARKET} 한인 커뮤니티 Korean-English bilingual 로컬 채용 공고.`,
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = parseJobSearchParams(await searchParams);
  const hasFilters = Object.entries(params).some(
    ([key, value]) => key !== "sort" || value !== "newest",
  );
  const jobs = await searchApprovedJobs(params);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">공고 둘러보기</h1>
        <p className="mt-1 text-sm text-muted">
          {LAUNCH_MARKET} · {hasFilters ? "검색 결과" : "검증된 공고"}{" "}
          {jobs.length}개
        </p>
      </header>

      <JobFilters values={params} />

      <section className="mt-5">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            <p>조건에 맞는 공고가 없습니다.</p>
            {hasFilters && (
              <Link
                href="/jobs"
                className="mt-2 inline-block text-sm text-brand hover:underline"
              >
                필터 초기화 / Reset
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
