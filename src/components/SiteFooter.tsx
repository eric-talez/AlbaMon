import Link from "next/link";
import { SITE_NAME, LAUNCH_MARKET } from "@/lib/site";

const FOOTER_LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/posting-policy", label: "공고 등록 정책" },
  { href: "/work-authorization-info", label: "근로자격 안내" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 text-sm text-muted">
        <p className="font-semibold text-foreground">{SITE_NAME}</p>
        <p className="mt-1">
          {LAUNCH_MARKET} · Korean-English bilingual local jobs
        </p>
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-brand">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="mt-4 text-xs leading-5">
          본 플랫폼은 Korean-English bilingual 로컬 채용을 지원하며, 국적·시민권·
          비자 상태에 따른 차별적 공고를 허용하지 않습니다. 개인의 미국 내 취업
          자격을 판단하지 않으며, 제공되는 정보는 법률 자문이 아닙니다.
        </p>
      </div>
    </footer>
  );
}
