import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

const NAV_LINKS = [
  { href: "/jobs", label: "공고" },
  { href: "/employer/jobs/new", label: "공고 등록" },
  { href: "/employer/dashboard", label: "고용주" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground">
            K
          </span>
          <span className="text-base font-bold tracking-tight">{SITE_NAME}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-1 rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            로그인
          </Link>
        </nav>

        {/* Mobile: login only; primary nav lives in the bottom bar */}
        <Link
          href="/login"
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 sm:hidden"
        >
          로그인
        </Link>
      </div>
    </header>
  );
}
