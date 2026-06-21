import { signOut } from "@/lib/auth/actions";

/** Server-action sign-out button (no client JS required). */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        로그아웃
      </button>
    </form>
  );
}
