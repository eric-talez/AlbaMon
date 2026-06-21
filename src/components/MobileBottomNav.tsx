import Link from "next/link";

const ITEMS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/jobs", label: "공고", icon: "🔍" },
  { href: "/employer/jobs/new", label: "등록", icon: "➕" },
  { href: "/dashboard", label: "내 지원", icon: "📋" },
  { href: "/login", label: "내정보", icon: "👤" },
];

/** Compact bottom navigation for mobile (hidden on desktop). */
export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur sm:hidden">
      <ul className="mx-auto flex max-w-5xl items-stretch justify-around">
        {ITEMS.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted transition-colors hover:text-brand"
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
