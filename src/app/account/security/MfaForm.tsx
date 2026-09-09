"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export function MfaForm({ next }: { next: string }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (pending || factorId) return;
    setPending(true);
    setError("");
    try {
      const { mfa } = createSupabaseBrowserClient().auth;
      const factors = await mfa.listFactors();
      if (factors.error) throw factors.error;
      const verified = factors.data.totp[0];
      if (verified) {
        setFactorId(verified.id);
      } else {
        // Recover an abandoned enrollment after navigation; never remove verified factors.
        for (const factor of factors.data.all) {
          if (factor.factor_type === "totp" && factor.status === "unverified") {
            const removed = await mfa.unenroll({ factorId: factor.id });
            if (removed.error) throw removed.error;
          }
        }
        const result = await mfa.enroll({ factorType: "totp" });
        if (result.error) throw result.error;
        setFactorId(result.data.id);
        setEnrollment({ qr: result.data.totp.qr_code, secret: result.data.totp.secret });
      }
    } catch {
      setError("인증을 시작하지 못했습니다. 다시 시도하거나 다시 로그인해 주세요. (Could not start verification. Retry or sign in again.)");
    } finally {
      setPending(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || pending) return;
    setPending(true);
    setError("");
    try {
      const { mfa } = createSupabaseBrowserClient().auth;
      const challenge = await mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const result = await mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (result.error) throw result.error;
      setCode("");
      setEnrollment(null);
      // A new server request reads the upgraded session cookies.
      window.location.assign(sanitizeNextPath(next));
    } catch {
      setCode("");
      setError("인증번호를 확인하지 못했습니다. 앱의 새 번호로 다시 시도해 주세요. (Verification failed. Try the latest code from your app.)");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {!factorId ? (
        <button onClick={() => void start()} disabled={pending}
          className="rounded-lg bg-brand px-4 py-3 font-medium text-brand-foreground disabled:opacity-60">
          {pending ? "준비 중… (Preparing…)" : "인증 시작 / Start verification"}
        </button>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {enrollment ? (
            <div className="space-y-3">
              <p className="text-sm">인증 앱으로 QR을 스캔하세요. (Scan with your authenticator app.)</p>
              {/* Auth supplies a data URL. Keep QR/secret only in memory, never in optimized image URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qr} alt="인증 앱 등록 QR / Authenticator setup QR" width={200} height={200} />
              <details className="text-sm">
                <summary>직접 입력 / Enter manually</summary>
                <code data-totp-secret className="mt-2 block break-all">{enrollment.secret}</code>
              </details>
              <p className="text-sm text-muted">등록 키를 다른 사람과 공유하지 마세요. (Keep your setup key private.)</p>
            </div>
          ) : <p className="text-sm">등록된 인증 앱의 번호를 입력하세요. (Enter a code from your registered app.)</p>}
          <label className="block text-sm font-medium">
            인증번호 / Verification code
            <input value={code} onChange={(event) => setCode(event.target.value.trim())} required
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              className="mt-1 block w-full rounded-lg border border-border p-3" />
          </label>
          <button disabled={pending} className="rounded-lg bg-brand px-4 py-3 font-medium text-brand-foreground disabled:opacity-60">
            {pending ? "확인 중… (Verifying…)" : "인증 확인 / Verify"}
          </button>
        </form>
      )}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
