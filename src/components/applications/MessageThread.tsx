"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ApplicationMessage } from "@/lib/db/messages";
import type { MessageFormState } from "@/lib/messages/action";

const INITIAL_STATE: MessageFormState = { status: "idle", message: "" };

function formatMessageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "시간 정보 없음"
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function MessageThread({
  applicationId,
  messages,
  sendAction,
}: {
  applicationId: string;
  messages: ApplicationMessage[];
  sendAction: (
    previousState: MessageFormState,
    formData: FormData,
  ) => Promise<MessageFormState>;
}) {
  const [state, formAction, pending] = useActionState(sendAction, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status]);

  return (
    <>
      {messages.length === 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
          <h2 className="font-semibold">아직 메시지가 없습니다.</h2>
          <p className="mt-2 text-sm text-muted">지원 내용과 관련된 첫 메시지를 보내 보세요.</p>
        </section>
      ) : (
        <ol className="mt-6 space-y-3" aria-label="지원 메시지">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`flex ${message.isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  message.isOwn
                    ? "max-w-[85%] rounded-2xl bg-brand px-4 py-3 text-brand-foreground"
                    : "max-w-[85%] rounded-2xl border border-border bg-surface px-4 py-3"
                }
              >
                <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                <p className={`mt-2 text-xs ${message.isOwn ? "opacity-75" : "text-muted"}`}>
                  {message.isOwn ? "나" : "상대방"} · {formatMessageTime(message.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form ref={formRef} action={formAction} className="mt-6 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="applicationId" value={applicationId} />
        <label htmlFor="message-body" className="text-sm font-semibold">새 메시지</label>
        <textarea
          id="message-body"
          name="body"
          required
          maxLength={2_000}
          rows={5}
          className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand"
        />
        <p className="mt-1 text-xs text-muted">최대 2,000자 · 연락처와 민감한 개인정보 공유에 주의하세요.</p>
        {state.message ? (
          <p
            role={state.status === "success" ? "status" : "alert"}
            className={state.status === "success" ? "mt-3 text-sm text-brand" : "mt-3 text-sm text-danger"}
          >
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "전송 중…" : "메시지 보내기"}
        </button>
      </form>
    </>
  );
}
