import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다.</h1>
      <p>공고가 마감되었거나 주소가 변경되었을 수 있습니다. This page is no longer available.</p>
      <p><Link className="text-brand underline" href="/jobs">공고 둘러보기</Link></p>
      <p><Link className="text-brand underline" href="/dashboard/applications">내 지원 현황</Link></p>
      <p><Link className="text-brand underline" href="/">홈으로 / Home</Link></p>
    </main>
  );
}
