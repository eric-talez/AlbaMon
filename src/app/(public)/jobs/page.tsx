import type { Metadata } from "next";
import { JobCard } from "@/components/JobCard";
import { JobFilters } from "@/components/JobFilters";
import { getApprovedJobs } from "@/lib/db/jobs";
import { LAUNCH_MARKET } from "@/lib/site";

export const metadata: Metadata = {
  title: "공고 둘러보기",
  description: `${LAUNCH_MARKET} 한인 커뮤니티 Korean-English bilingual 로컬 채용 공고.`,
};

export default async function JobsPage() {
  const jobs = await getApprovedJobs();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">공고 둘러보기</h1>
        <p className="mt-1 text-sm text-muted">
          {LAUNCH_MARKET} · 검증된 {jobs.length}개의 공고
        </p>
      </header>

      <JobFilters />

      <section className="mt-5">
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            조건에 맞는 공고가 아직 없습니다.
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
