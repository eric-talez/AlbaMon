import Link from "next/link";

interface ComingSoonProps {
  /** Korean-first page title. */
  title: string;
  /** Optional English subtitle for bilingual clarity. */
  subtitle?: string;
  /** Short description of what will live here. */
  description?: string;
}

/**
 * Lightweight placeholder for routes that are linked from the public shell but
 * not yet implemented (auth, employer posting, policy pages). Renders 200 and
 * keeps a path back home. Replaced by real pages in later slices.
 */
export function ComingSoon({ title, subtitle, description }: ComingSoonProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <span className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
        준비 중 · Coming soon
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
      {description ? (
        <p className="mt-4 max-w-md text-sm leading-6 text-muted">
          {description}
        </p>
      ) : null}
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-full border border-border px-6 font-medium transition-colors hover:bg-surface"
      >
        홈으로
      </Link>
    </main>
  );
}
