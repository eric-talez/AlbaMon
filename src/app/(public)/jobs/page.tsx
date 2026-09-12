import type { Metadata } from "next";
import Link from "next/link";
import { JobCard } from "@/components/JobCard";
import { JobFilters } from "@/components/JobFilters";
import {
  getPublicJobCities,
  parseJobSearchParams,
  searchApprovedJobs,
} from "@/lib/db/jobs";
import { LAUNCH_MARKET } from "@/lib/site";

export const metadata: Metadata = {
  title: "공고 둘러보기",
  description: `${LAUNCH_MARKET} 한인 커뮤니티 Korean-English bilingual 로컬 채용 공고.`,
  // Filter query params all present the same listing — one canonical URL.
  alternates: { canonical: "/jobs" },
};

function pageHref(params: ReturnType<typeof parseJobSearchParams>, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, page })) {
    if (value !== undefined && !(key === "page" && value === 1)) {
      query.set(key, String(value));
    }
  }
  const search = query.toString();
  return search ? `/jobs?${search}` : "/jobs";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = parseJobSearchParams(await searchParams);
  const hasFilters = Object.entries(params).some(
    ([key, value]) =>
      key !== "page" && (key !== "sort" || value !== "newest") && value !== undefined,
  );
  const [result, cities] = await Promise.all([
    searchApprovedJobs(params),
    getPublicJobCities(),
  ]);
  const { jobs, page, hasNext } = result;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">공고 둘러보기</h1>
        <p className="mt-1 text-sm text-muted">
          {LAUNCH_MARKET} · {hasFilters ? "검색 결과" : "검증된 공고"}{" "}
          {jobs.length}개
        </p>
      </header>

      <JobFilters cities={cities} values={params} />

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

      {(page > 1 || hasNext) && (
        <nav className="mt-6 flex items-center justify-center gap-4" aria-label="검색 결과 페이지">
          {page > 1 && (
            <Link href={pageHref(params, page - 1)} className="text-sm font-medium text-brand hover:underline">
              ← 이전 페이지
            </Link>
          )}
          <span className="text-sm text-muted">{page} 페이지</span>
          {hasNext && (
            <Link href={pageHref(params, page + 1)} className="text-sm font-medium text-brand hover:underline">
              다음 페이지 →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
