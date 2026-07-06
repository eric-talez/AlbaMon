import Link from "next/link";
import { getSocialProviders, isPhoneAuthEnabled } from "@/lib/auth/providers";
import { DevAuthForm } from "@/components/auth/DevAuthForm";
import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

/**
 * The shared /login + /signup card: social provider buttons, the phone OTP
 * flow (or its setup-required note), and — in dev mode only — the dev
 * role-picker form.
 *
 * Error codes from the query string map to fixed bilingual messages; the raw
 * code is never echoed into the page.
 */

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  use_real_auth:
    "개발 모드 로그인은 사용할 수 없습니다. 아래 방법으로 로그인해 주세요. (Dev sign-in is unavailable here. Please use a method below.)",
};

const GENERIC_AUTH_ERROR =
  "로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요. (Something went wrong during sign-in. Please try again.)";

interface AuthCardProps {
  mode: "login" | "signup";
  next?: string;
  error?: string;
}

export function AuthCard({ mode, next, error }: AuthCardProps) {
  const isLogin = mode === "login";
  const errorMessage = error
    ? (AUTH_ERROR_MESSAGES[error] ?? GENERIC_AUTH_ERROR)
    : null;

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{isLogin ? "로그인" : "회원가입"}</h1>
        <p className="mt-1 text-sm text-muted">
          {isLogin ? "Sign in" : "Create account"}
        </p>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-5">
        <SocialAuthButtons providers={getSocialProviders()} next={next} />
      </div>

      <div
        className="mt-5 flex items-center gap-3 text-xs text-muted"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        또는 (or)
        <span className="h-px flex-1 bg-border" />
      </div>

      <section className="mt-5">
        <h2 className="text-sm font-semibold">
          휴대폰으로 로그인 (Sign in with phone)
        </h2>
        {isPhoneAuthEnabled() ? (
          <PhoneOtpForm next={next} />
        ) : (
          <p className="mt-2 text-xs text-muted">
            휴대폰 인증은 SMS 설정 후 이용 가능합니다. (Phone verification
            requires SMS setup.)
          </p>
        )}
      </section>

      <DevAuthForm mode={mode} next={next} />

      <p className="mt-5 text-center text-sm text-muted">
        {isLogin ? (
          <>
            계정이 없으신가요?{" "}
            <Link href="/signup" className="font-medium text-brand">
              회원가입
            </Link>
          </>
        ) : (
          <>
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-medium text-brand">
              로그인
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
