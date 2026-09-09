import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { AccountBar } from "@/components/auth/AccountBar";
import { MfaForm } from "./MfaForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "계정 보안 / Account security" };
export default async function SecurityPage() {
  const user = await requireUser("/account/security");
  if (user.accountStatus !== "active") redirect("/forbidden");
  const next = user.role === "admin" ? "/admin" : "/dashboard";
  return (
    <div>
      <AccountBar user={user} />
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold">계정 보안 / Account security</h1>
        <p className="mt-2 text-sm text-muted">관리자 권한을 사용하려면 이 세션에서 인증 앱 확인이 필요합니다. (Admin access requires authenticator verification in this session.)</p>
        {user.isDev ? (
          <p className="mt-6">인증 앱 등록은 연결된 계정에서 이용해 주세요. (Use a connected account to enroll an authenticator.)</p>
        ) : user.aal === "aal2" ? (
          <div className="mt-6 space-y-4">
            <p role="status">인증 완료 / Verification complete</p>
            <Link href={next} className="text-brand underline">계속 / Continue</Link>
          </div>
        ) : <MfaForm next={next} />}
        <p className="mt-6 text-sm text-muted">인증 앱을 잃어버린 경우 운영자의 계정 복구 절차를 이용해 주세요. (If you lose your authenticator, request account recovery from the operator.)</p>
      </main>
    </div>
  );
}
