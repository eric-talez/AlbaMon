import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getApplicationThread } from "@/lib/db/messages";
import { MessageThread } from "@/components/applications/MessageThread";
import { sendEmployerApplicationMessage } from "./actions";

export const metadata: Metadata = { title: "지원자 메시지" };

export default async function EmployerApplicationMessagesPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const path = `/employer/applications/${encodeURIComponent(applicationId)}/messages`;
  const user = await requireRole("employer", path);
  const result = await getApplicationThread(applicationId, user.id);
  if (result.status === "not_allowed") notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/employer/applications" className="text-sm font-medium text-brand hover:underline">← 지원자 목록</Link>
      <p className="mt-6 text-xs font-medium text-brand">K-Work US 고용주 메시지</p>
      <h1 className="mt-1 text-2xl font-bold">지원자 메시지</h1>
      {result.status !== "ok" ? (
        <section className="mt-6 rounded-xl border border-border bg-surface p-5" role="alert">
          <h2 className="font-semibold">메시지를 사용할 수 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">
            {result.status === "unavailable"
              ? "Supabase가 연결된 환경에서만 실제 메시지를 확인할 수 있습니다."
              : "메시지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
          </p>
        </section>
      ) : (
        <>
          <section className="mt-5 rounded-xl bg-brand-soft p-4">
            <p className="text-sm text-muted">{result.thread.companyName}</p>
            <h2 className="mt-1 font-semibold">{result.thread.jobTitle}</h2>
            <p className="mt-1 text-xs text-muted">지원 상태: {result.thread.applicationStatus}</p>
          </section>
          <MessageThread
            applicationId={result.thread.applicationId}
            messages={result.thread.messages}
            sendAction={sendEmployerApplicationMessage}
          />
        </>
      )}
    </main>
  );
}
