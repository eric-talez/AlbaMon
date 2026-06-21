import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import type { AuthUser } from "@/lib/auth/types";
import { ROLE_LABELS } from "@/lib/auth/types";
import { SignOutButton } from "@/components/auth/SignOutButton";

/** Top bar for authenticated areas: brand, signed-in identity, sign out. */
export function AccountBar({ user }: { user: AuthUser }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-brand-foreground">
            K
          </span>
          <span className="text-base font-bold tracking-tight">{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">
            {user.email}
          </span>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
            {ROLE_LABELS[user.role]}
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
