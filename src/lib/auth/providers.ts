import type { Provider } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Social auth provider registry — the single allowlist between the UI and
 * Supabase. Only provider strings produced here may reach
 * `supabase.auth.signInWithOAuth`; arbitrary or user-influenced strings never
 * resolve (`resolveOAuthProvider` returns null for anything unknown/disabled).
 *
 * Enablement is driven by public build-time flags (`NEXT_PUBLIC_AUTH_*`).
 * They are inlined into the client bundle at `next build`, so they must be
 * read as literal `process.env.NEXT_PUBLIC_X` property accesses — and a flag
 * change requires a rebuild. The flags are booleans, not secrets; the real
 * OAuth credentials live only in the Supabase dashboard.
 *
 * A provider is "enabled" only when its flag is exactly "true" AND Supabase
 * itself is configured (in dev-auth mode everything stays "setup_required").
 */

export const SOCIAL_PROVIDER_KEYS = ["kakao", "google", "naver"] as const;
export type SocialProviderKey = (typeof SOCIAL_PROVIDER_KEYS)[number];

export type SocialProviderStatus = "enabled" | "setup_required";

export interface SocialProviderInfo {
  key: SocialProviderKey;
  label: string;
  status: SocialProviderStatus;
}

const SOCIAL_PROVIDER_LABELS: Record<SocialProviderKey, string> = {
  kakao: "카카오톡으로 계속하기 (Continue with KakaoTalk)",
  google: "Google로 계속하기 (Continue with Google)",
  naver: "네이버로 계속하기 (Continue with Naver)",
};

/**
 * Naver is not a built-in Supabase provider; it goes through Supabase's
 * custom OIDC provider support (`custom:<slug>`). The slug is the identifier
 * of the custom provider registered in the Supabase dashboard. The strict
 * shape check (lowercase alphanumeric start, then [a-z0-9_-], max 63 chars)
 * structurally rejects URL-ish values and `custom:`-prefix smuggling.
 */
export const NAVER_PROVIDER_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function naverProviderSlug(): string | null {
  const raw = (process.env.NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID ?? "").trim();
  return NAVER_PROVIDER_SLUG_RE.test(raw) ? raw : null;
}

function socialFlag(key: SocialProviderKey): boolean {
  switch (key) {
    case "kakao":
      return process.env.NEXT_PUBLIC_AUTH_KAKAO_ENABLED === "true";
    case "google":
      return process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
    case "naver":
      return process.env.NEXT_PUBLIC_AUTH_NAVER_ENABLED === "true";
  }
}

function isSocialProviderKey(key: string): key is SocialProviderKey {
  return (SOCIAL_PROVIDER_KEYS as readonly string[]).includes(key);
}

function socialProviderStatus(key: SocialProviderKey): SocialProviderStatus {
  if (!socialFlag(key) || !isSupabaseConfigured()) return "setup_required";
  if (key === "naver" && naverProviderSlug() === null) return "setup_required";
  return "enabled";
}

/** All known social providers, in display order, with their current status. */
export function getSocialProviders(): SocialProviderInfo[] {
  return SOCIAL_PROVIDER_KEYS.map((key) => ({
    key,
    label: SOCIAL_PROVIDER_LABELS[key],
    status: socialProviderStatus(key),
  }));
}

/**
 * The Supabase `Provider` string for a provider key, or null when the key is
 * unknown or the provider is not enabled. This is the only place a provider
 * string is constructed — callers must treat null as "do not call Supabase".
 */
export function resolveOAuthProvider(key: string): Provider | null {
  if (!isSocialProviderKey(key)) return null;
  if (socialProviderStatus(key) !== "enabled") return null;
  if (key === "naver") {
    const slug = naverProviderSlug();
    return slug === null ? null : `custom:${slug}`;
  }
  return key;
}

/** Phone OTP sign-in requires its flag plus a configured Supabase project. */
export function isPhoneAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED === "true" &&
    isSupabaseConfigured()
  );
}
