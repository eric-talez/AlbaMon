import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { getAdminAccounts, getAccountAudit } from "@/lib/db/admin-moderation";
import { normalizePage as adminPage } from "@/lib/pagination";
import { AdminPagination } from "../AdminPagination";
import { AccountForm } from "./AccountForm";
export const metadata = { title: "계정 관리 / Accounts" };
export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<{ page?: string; status?: string }> } = {}) {
  const admin = await requireRole("admin", "/admin/users");
  const params = await searchParams, page = adminPage(params?.page);
  const status = params?.status === "suspended" ? "suspended" : "active";
  const result = await getAdminAccounts(page, status);
  const audit = result.status === "ok" ? await getAccountAudit(result.accounts.map(account => account.id)) : null;
  return <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
    <Link href="/admin">← 관리자 콘솔</Link>
    <h1 className="mt-4 text-2xl font-bold">계정 관리 / Accounts</h1>
    <p className="mt-2 text-sm">정지는 새 쓰기를 차단하고 대기·공개 공고를 중지합니다. 기존 지원·대화 내역은 유지합니다. 해제 후 공고는 다시 제출·검토해야 합니다. 처리 사유는 운영 이력에 기록됩니다.</p>
    <nav className="my-4 flex gap-4"><Link href="/admin/users?status=active">활성 / Active</Link><Link href="/admin/users?status=suspended">정지 / Suspended</Link><Link href="/admin#activity">운영 이력 / Audit</Link></nav>
    {result.status !== "ok" ? <p role="alert">계정 목록을 불러올 수 없습니다.</p> : <>
      <ul className="space-y-4">{result.accounts.map(account => <li key={account.id} className="rounded-xl border border-border p-5">
        <h2 className="font-semibold">{account.display_name ?? "이름 없음"} · {account.email}</h2>
        <p className="text-sm text-muted">{account.id} · {account.role} · {account.account_status}</p>
        <AccountForm userId={account.id} suspended={account.account_status === "suspended"} self={admin.id === account.id} />
      </li>)}</ul>
      <AdminPagination page={page} count={result.accounts.length} href={`/admin/users?status=${status}`} />
    </>}
    <section className="mt-6"><h2 className="font-semibold">이 페이지 계정의 최근 운영 이력 / Recent account audit (20)</h2>
      {audit === null ? <p>이력을 불러올 수 없습니다.</p> : <ul>{audit.map(entry => <li key={entry.id} className="mt-2 rounded border border-border p-3 text-sm">{entry.action} · {entry.entity_id} · {entry.created_at}<p>처리자: {entry.actor_id ?? "—"}</p><p>사유: {entry.reason ?? "—"}</p></li>)}</ul>}
    </section>
  </main>;
}
