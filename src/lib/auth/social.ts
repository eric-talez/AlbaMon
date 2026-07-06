import type { Provider } from "@supabase/supabase-js";
import { DEFAULT_AUTH_REDIRECT, sanitizeNextPath } from "@/lib/auth/redirect";
import { resolveOAuthProvider } from "@/lib/auth/providers";

/**
 * Social OAuth sign-in via Supabase Auth. The Supabase client is injected as
 * a narrow structural interface so unit tests can pass a plain fake object;
 * `createSupabaseBrowserClient().auth` satisfies it at the call sites.
 *
 * Error messages are fixed constants — provider keys, Supabase error details,
 * and user input are never interpolated into them, and nothing is logged.
 */

export interface OAuthAuthClient {
  signInWithOAuth(credentials: {
    provider: Provider;
    options?: { redirectTo?: string };
  }): Promise<{ error: unknown }>;
}

export type SocialAuthResult = { ok: true } | { ok: false; message: string };

export const SOCIAL_AUTH_MESSAGES = {
  unsupported: "지원하지 않는 로그인 방식입니다. (Unsupported sign-in method.)",
  startFailed:
    "로그인을 시작하지 못했습니다. 다시 시도해 주세요. (Could not start sign-in. Please try again.)",
} as const;

/**
 * The OAuth callback URL for this app. `next` is sanitized before it is
 * embedded; the default target is omitted to keep the common URL canonical
 * (helps Supabase redirect-allowlist matching).
 */
export function buildOAuthRedirectTo(
  origin: string,
  next?: string | null,
): string {
  const sanitized = sanitizeNextPath(next);
  const base = `${origin}/auth/callback`;
  return sanitized === DEFAULT_AUTH_REDIRECT
    ? base
    : `${base}?next=${encodeURIComponent(sanitized)}`;
}

/**
 * Start the OAuth redirect flow for a provider key. The key is re-validated
 * through the registry here — unknown or not-enabled providers never reach
 * Supabase. On success the browser is navigating away to the provider.
 */
export async function startOAuthSignIn(
  auth: OAuthAuthClient,
  key: string,
  opts: { origin: string; next?: string | null },
): Promise<SocialAuthResult> {
  const provider = resolveOAuthProvider(key);
  if (provider === null) {
    return { ok: false, message: SOCIAL_AUTH_MESSAGES.unsupported };
  }

  try {
    const { error } = await auth.signInWithOAuth({
      provider,
      options: { redirectTo: buildOAuthRedirectTo(opts.origin, opts.next) },
    });
    if (error) {
      return { ok: false, message: SOCIAL_AUTH_MESSAGES.startFailed };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: SOCIAL_AUTH_MESSAGES.startFailed };
  }
}
