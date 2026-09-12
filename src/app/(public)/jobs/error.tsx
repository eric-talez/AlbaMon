"use client";

import Link from "next/link";

export default function JobsError({ retry }: { retry: () => void }) {
  return (
    <main role="alert" className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">공고를 불러오지 못했습니다.</h1>
      <p className="text-muted">일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.</p>
      <button
        className="min-h-11 rounded-full bg-brand px-5 text-brand-foreground"
        onClick={retry}
      >
        다시 시도 / Retry
      </button>
      <p>
        <Link prefetch={false} className="text-brand underline" href="/jobs">
          공고 목록으로
        </Link>
      </p>
    </main>
  );
}
