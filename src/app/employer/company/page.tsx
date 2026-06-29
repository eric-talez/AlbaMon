import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getEmployerCompanies } from "@/lib/db/companies";
import { CompanyForm } from "./CompanyForm";

export const metadata: Metadata = { title: "회사 정보" };

export default async function EmployerCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string | string[] }>;
}) {
  const user = await requireRole("employer", "/employer/company");
  const result = await getEmployerCompanies(user.id);
  if (result.status !== "ok") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold">회사 정보</h1>
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">회사 정보를 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서 실제 회사 정보를 관리할 수 있습니다."
              : "회사 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      </main>
    );
  }

  const rawSelection = (await searchParams).company;
  const selectedId = Array.isArray(rawSelection) ? rawSelection[0] : rawSelection;
  const selected = selectedId
    ? result.companies.find((company) => company.id === selectedId)
    : result.companies[0];
  if (selectedId && !selected) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-xs font-medium text-brand">K-Work US 고용주</p>
      <h1 className="mt-1 text-2xl font-bold">회사 정보</h1>
      <p className="mt-2 text-sm text-muted">
        공고를 등록하기 전에 회사 정보를 준비해 주세요. 인증 상태는 관리자 검토로만 변경됩니다.
      </p>

      {result.companies.length > 1 ? (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="회사 선택">
          {result.companies.map((company) => (
            <Link
              key={company.id}
              href={`/employer/company?company=${encodeURIComponent(company.id)}`}
              className={`rounded-full border px-4 py-2 text-sm ${
                company.id === selected?.id
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {company.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {selected ? (
        <div className="mt-6 rounded-lg border border-border px-4 py-3 text-sm">
          인증 상태: <strong>{selected.isVerified ? "인증됨" : "미인증"}</strong>
          <p className="mt-2 text-xs leading-5 text-muted">
            Company verification means company information was reviewed. It is
            not a guarantee of job quality, safety, legal compliance, applicants,
            or hires.
          </p>
        </div>
      ) : null}
      <CompanyForm company={selected ?? null} />
    </main>
  );
}
