import Link from "next/link";
export function AdminPagination({ page, count, href }: { page: number; count: number; href: string }) {
  const link = (target: number) => `${href}${href.includes("?") ? "&" : "?"}page=${target}`;
  return <nav aria-label="페이지 / Pages" className="mt-6 flex gap-4 text-sm">
    {page > 1 && <Link href={link(page - 1)}>← 이전 / Previous</Link>}
    <span>{page} 페이지 · 페이지당 20개</span>
    {count === 20 && <Link href={link(page + 1)}>다음 / Next →</Link>}
  </nav>;
}
