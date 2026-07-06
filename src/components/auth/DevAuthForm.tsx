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
}

/**
 * Dev-mode role picker. Only in dev mode (non-production, no Supabase
 * configured) it sets a dev-session cookie with the selected role so the
 * role-guard flow is testable; otherwise it renders nothing — the real
 * sign-in methods live in `AuthCard`.
 */
export function DevAuthForm({ mode, next }: DevAuthFormProps) {
  const isLogin = mode === "login";

  if (!isDevAuthMode()) return null;

  return (
    <section className="mt-6 rounded-lg border border-dashed border-border p-4">
      <h2 className="text-sm font-semibold">개발 모드 로그인 (Dev mode)</h2>

      <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs text-brand">
        개발 모드: Supabase 미연결 상태로 역할을 선택해 임시 로그인합니다. 실제
        인증은 Supabase 연결 후 동작합니다.
      </div>

      <form action={signInDev} className="mt-4 flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <label className="flex flex-col gap-1 text-sm" htmlFor="dev-email">
          <span className="font-medium">이메일 (Email)</span>
          <input
            type="email"
            id="dev-email"
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
              htmlFor={`dev-role-${role}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface"
            >
              <input
                type="radio"
                id={`dev-role-${role}`}
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
    </section>
  );
}
