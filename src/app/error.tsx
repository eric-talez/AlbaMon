"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main role="alert" className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">잠시 불러오지 못했습니다.</h1>
      <p>저장 여부는 내 지원 현황에서 확인할 수 있습니다. Check your applications before submitting again.</p>
      <button className="min-h-11 rounded-full bg-brand px-5 text-brand-foreground" onClick={retry}>다시 시도 / Retry</button>
      <p><Link prefetch={false} className="text-brand underline" href="/dashboard/applications">내 지원 현황</Link></p>
      <p><Link prefetch={false} className="text-brand underline" href="/jobs">공고 둘러보기</Link></p>
    </main>
  );
}
