"use client";

import { useEffect, useState } from "react";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import {
  remainingCooldownSeconds,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/auth/phone";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface PhoneOtpFormProps {
  next?: string;
}

/**
 * Two-step phone OTP flow: enter number → enter the 6-digit code.
 * Sending and verifying go through Supabase Phone Auth only (see
 * `@/lib/auth/phone`); codes are never stored here and neither the number nor
 * the code is ever logged. Rendered only when phone auth is enabled —
 * `AuthCard` shows a setup-required note otherwise.
 */
export function PhoneOtpForm({ next }: PhoneOtpFormProps) {
  const [step, setStep] = useState<"phone" | "token">("phone");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (lastSentAt === null) return;
    const update = () =>
      setCooldown(remainingCooldownSeconds(lastSentAt, Date.now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [lastSentAt]);

  async function handleSend(): Promise<void> {
    if (pending) return;
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const result = await sendPhoneOtp(supabase.auth, phone);
    setPending(false);
    if (result.ok) {
      setStep("token");
      setToken("");
      setLastSentAt(Date.now());
    } else {
      setError(result.message);
    }
  }

  async function handleVerify(): Promise<void> {
    if (pending) return;
    setError(null);
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const result = await verifyPhoneOtp(supabase.auth, phone, token);
    if (result.ok) {
      // Full navigation (not router.push): the verified session cookies must
      // be picked up by the server-side guards on the destination page.
      window.location.assign(sanitizeNextPath(next));
      return;
    }
    setPending(false);
    setError(result.message);
  }

  function handleChangeNumber(): void {
    setStep("phone");
    setToken("");
    setError(null);
  }

  if (step === "phone") {
    return (
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <label className="flex flex-col gap-1 text-sm" htmlFor="phone-otp-number">
          <span className="font-medium">휴대폰 번호 (Phone number)</span>
          <input
            type="tel"
            id="phone-otp-number"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 213 555 0100"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:border-brand"
          />
        </label>
        <p className="text-xs text-muted">
          국가번호를 포함해 입력해 주세요. 휴대폰 인증은 해당 번호의 소유 확인만을
          의미합니다. (Include the country code. Verification only confirms
          control of this phone number.)
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-brand font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "전송 중… (Sending…)" : "인증번호 받기 (Send code)"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void handleVerify();
      }}
    >
      <p className="text-xs text-muted">
        입력하신 번호로 인증번호를 보냈습니다. (We sent a verification code to
        your number.)
      </p>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{phone}</span>
        <button
          type="button"
          onClick={handleChangeNumber}
          className="text-xs font-medium text-brand"
        >
          번호 변경 (Change number)
        </button>
      </div>
      <label className="flex flex-col gap-1 text-sm" htmlFor="phone-otp-token">
        <span className="font-medium">인증번호 (Enter the 6-digit code)</span>
        <input
          type="text"
          id="phone-otp-token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 tracking-widest outline-none focus:border-brand"
        />
      </label>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full bg-brand font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "확인 중… (Verifying…)" : "인증하고 계속하기 (Verify and continue)"}
      </button>
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={pending || cooldown > 0}
        className="h-9 rounded-full border border-border text-xs font-medium text-muted transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cooldown > 0
          ? `${cooldown}초 후 다시 받을 수 있습니다 (Resend in ${cooldown}s)`
          : "인증번호 다시 받기 (Resend code)"}
      </button>
    </form>
  );
}
