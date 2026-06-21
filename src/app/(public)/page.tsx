import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE, LAUNCH_MARKET } from "@/lib/site";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-xl text-center">
        <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
          {LAUNCH_MARKET} 베타
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          {SITE_NAME}
        </h1>
        <p className="mt-3 text-lg text-muted">
          {SITE_TAGLINE} · Korean-English bilingual local jobs
        </p>
        <p className="mt-6 text-base leading-7 text-muted">
          급여·근무시간·위치·영어 요구 수준이 명확한 모바일 우선 구인구직
          플랫폼입니다. 한인 소상공인과 한국어 가능 구직자를 빠르고 안전하게
          연결합니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/jobs"
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            공고 둘러보기
          </Link>
          <Link
            href="/employer/jobs/new"
            className="inline-flex h-12 items-center justify-center rounded-full border border-border px-6 font-medium transition-colors hover:bg-surface"
          >
            공고 등록 (고용주)
          </Link>
        </div>
        <p className="mt-10 text-xs text-muted">
          본 플랫폼은 개인의 미국 내 취업 자격(work authorization)을 판단하지
          않습니다. 일반 정보 제공 목적이며 법률 자문이 아닙니다.
        </p>
      </div>
    </main>
  );
}
