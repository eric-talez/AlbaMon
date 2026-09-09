"use client";

import { useState } from "react";
import type { SocialProviderInfo } from "@/lib/auth/providers";
import { startOAuthSignIn } from "@/lib/auth/social";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface SocialAuthButtonsProps {
  providers: SocialProviderInfo[];
  next?: string;
}

/**
 * Social sign-in buttons (Kakao / Google / Naver). Providers arrive as
 * serializable registry entries; the click handler re-validates the key
 * through the registry inside `startOAuthSignIn`, so a tampered prop can
 * never reach Supabase. Buttons stay neutral-styled: the app palette is
 * deliberately brand-independent and official provider brand assets are a
 * setup-time concern.
 */
export function SocialAuthButtons({ providers, next }: SocialAuthButtonsProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(key: string): Promise<void> {
    if (pendingKey !== null) return;
    setError(null);
    setPendingKey(key);
    // Created lazily inside the handler: this component also renders on the
    // server (initial HTML), where no browser client must be constructed.
    const supabase = createSupabaseBrowserClient();
    const result = await startOAuthSignIn(supabase.auth, key, {
      origin: window.location.origin,
      next,
    });
    if (!result.ok) {
      setError(result.message);
      setPendingKey(null);
    }
    // On success the browser is navigating to the provider; stay pending.
  }

  return (
    <div className="flex flex-col gap-2">
      {providers.filter((provider) => provider.status === "enabled").map((provider) => (
          <button
            key={provider.key}
            type="button"
            onClick={() => void handleClick(provider.key)}
            disabled={pendingKey !== null}
            className="h-11 w-full rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pendingKey === provider.key
              ? "이동 중… (Redirecting…)"
              : provider.label}
          </button>
        ),
      )}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
