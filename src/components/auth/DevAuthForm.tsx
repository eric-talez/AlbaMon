import Link from "next/link";
import { ROLES } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/auth/types";
import { isDevAuthMode } from "@/lib/auth/session";
import { signInDev } from "@/lib/auth/actions";

const ROLE_HINTS: Record<(typeof ROLES)[number], string> = {
  seeker: "공고 검색·지원",
  employer: "공고 등록·지원자 관리",
  admin: "공고 검수·운영",
};

interface DevAuthFormProps {
  mode: "login" | "signup";
  next?: string;
  error?: string;
}

/**
 * Server-rendered auth form. In dev mode (no Supabase configured) it sets a
 * dev-session cookie with the selected role so the role-guard flow is testable.
 * When Supabase is configured, it shows a notice instead of faking a session.
 */
export function DevAuthForm({ mode, next, error }: DevAuthFormProps) {
  const isLogin = mode === "login";
  const title = isLogin ? "로그인" : "회원가입";
  const subtitle = isLogin ? "Sign in" : "Create account";

  if (!isDevAuthMode()) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          이메일/소셜 로그인 UI는 다음 단계에서 제공됩니다. (Email/social sign-in
          coming soon.)
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>

      <div className="mt-4 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">
        개발 모드: Supabase 미연결 상태로 역할을 선택해 임시 로그인합니다. 실제
        인증은 Supabase 연결 후 동작합니다.
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.
        </p>
      ) : null}

      <form action={signInDev} className="mt-5 flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">이메일 (Email)</span>
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus:border-brand"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">역할 (Role)</legend>
          {ROLES.map((role, i) => (
            <label
              key={role}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={i === 0}
                className="accent-brand"
              />
              <span className="font-medium">{ROLE_LABELS[role]}</span>
              <span className="text-xs text-muted">{ROLE_HINTS[role]}</span>
            </label>
          ))}
        </fieldset>

        <button
          type="submit"
          className="h-11 rounded-full bg-brand font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          {isLogin ? "로그인" : "회원가입"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
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
