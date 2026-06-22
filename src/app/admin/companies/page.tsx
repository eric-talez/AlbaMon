import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminCompanies } from "@/lib/db/admin-moderation";
import { CompanyVerificationForm } from "./CompanyVerificationForm";

export const metadata: Metadata = { title: "회사 인증 관리" };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "날짜 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

export default async function AdminCompaniesPage() {
  await requireRole("admin", "/admin/companies");
  const result = await getAdminCompanies();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/admin" className="text-sm font-medium text-brand hover:underline">← 관리자 콘솔</Link>
      <h1 className="mt-4 text-2xl font-bold">회사 인증 관리</h1>
      <p className="mt-2 text-sm text-muted">회사 정보와 소유자 연락 정보를 확인한 뒤 인증 상태를 변경합니다.</p>

      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">회사 목록을 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 회사 인증을 관리할 수 있습니다."
              : "회사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : result.companies.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">등록된 회사가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">회사가 등록되면 이곳에 표시됩니다.</p>
        </section>
      ) : (
        <ul className="mt-6 grid gap-5 lg:grid-cols-2">
          {result.companies.map((company) => (
            <li key={company.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{company.name}</h2>
                  <p className="mt-1 text-sm text-muted">{company.city}, {company.state}</p>
                </div>
                <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
                  {company.isVerified ? "인증됨" : "미인증"}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
                {company.description ?? "회사 소개 없음"}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div><dt className="inline text-muted">주소: </dt><dd className="inline">{company.addressDisplay ?? "주소 정보 없음"}</dd></div>
                <div><dt className="inline text-muted">웹사이트: </dt><dd className="inline">{company.website ?? "정보 없음"}</dd></div>
                <div><dt className="inline text-muted">회사 전화: </dt><dd className="inline">{company.phone ?? "정보 없음"}</dd></div>
                <div><dt className="inline text-muted">소유자: </dt><dd className="inline">{company.ownerDisplayName ?? "이름 정보 없음"}</dd></div>
                <div><dt className="inline text-muted">소유자 이메일: </dt><dd className="inline">{company.ownerEmail ?? "이메일 정보 없음"}</dd></div>
                <div><dt className="inline text-muted">등록일: </dt><dd className="inline">{formatDate(company.createdAt)}</dd></div>
              </dl>
              <CompanyVerificationForm companyId={company.id} isVerified={company.isVerified} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
