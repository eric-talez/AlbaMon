import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSocialProviders,
  isPhoneAuthEnabled,
  resolveOAuthProvider,
} from "@/lib/auth/providers";
import {
  buildOAuthRedirectTo,
  SOCIAL_AUTH_MESSAGES,
  startOAuthSignIn,
  type OAuthAuthClient,
} from "@/lib/auth/social";

/**
 * Slice 19: the provider registry is the only path from the UI to
 * `signInWithOAuth`. These tests pin the allowlist (unknown/disabled keys
 * never resolve), the strict flag parsing, the Naver custom-OIDC slug
 * validation, and the OAuth start call shape.
 */

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";
const PLACEHOLDER_URL = "https://your-project.supabase.co";
const PLACEHOLDER_KEY = "your-anon-key";

const AUTH_FLAG_VARS = [
  "NEXT_PUBLIC_AUTH_KAKAO_ENABLED",
  "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED",
  "NEXT_PUBLIC_AUTH_NAVER_ENABLED",
  "NEXT_PUBLIC_AUTH_PHONE_ENABLED",
  "NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID",
] as const;

/** Stub Supabase config plus ALL auth flags so ambient env never leaks in. */
function setEnv(opts: {
  configured: boolean;
  flags?: Partial<Record<(typeof AUTH_FLAG_VARS)[number], string>>;
}): void {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    opts.configured ? REAL_URL : PLACEHOLDER_URL,
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    opts.configured ? REAL_KEY : PLACEHOLDER_KEY,
  );
  for (const name of AUTH_FLAG_VARS) {
    vi.stubEnv(name, opts.flags?.[name] ?? "");
  }
}

function statusOf(key: string): string | undefined {
  return getSocialProviders().find((provider) => provider.key === key)?.status;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSocialProviders", () => {
  it("always lists kakao, google, naver in order with bilingual labels", () => {
    setEnv({ configured: false });
    const providers = getSocialProviders();
    expect(providers.map((provider) => provider.key)).toEqual([
      "kakao",
      "google",
      "naver",
    ]);
    expect(providers[0].label).toContain("카카오톡");
    expect(providers[0].label).toContain("Continue with KakaoTalk");
    expect(providers[1].label).toContain("Continue with Google");
    expect(providers[2].label).toContain("네이버");
    expect(providers[2].label).toContain("Continue with Naver");
  });

  it("everything is setup_required while Supabase is unconfigured, even with flags on", () => {
    setEnv({
      configured: false,
      flags: {
        NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true",
        NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID: "naver-oidc",
      },
    });
    for (const provider of getSocialProviders()) {
      expect(provider.status).toBe("setup_required");
    }
  });

  it("everything is setup_required when flags are off, even with Supabase configured", () => {
    setEnv({ configured: true });
    for (const provider of getSocialProviders()) {
      expect(provider.status).toBe("setup_required");
    }
  });

  it("enables exactly the flagged provider", () => {
    setEnv({
      configured: true,
      flags: { NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true" },
    });
    expect(statusOf("kakao")).toBe("enabled");
    expect(statusOf("google")).toBe("setup_required");
    expect(statusOf("naver")).toBe("setup_required");
  });

  it.each(["TRUE", "1", "yes", " true", "false"])(
    "treats flag value %j as off (only the exact string true enables)",
    (value) => {
      setEnv({
        configured: true,
        flags: { NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: value },
      });
      expect(statusOf("google")).toBe("setup_required");
    },
  );
});

describe("Naver custom-OIDC slug validation", () => {
  it("stays setup_required with the flag on but no slug", () => {
    setEnv({
      configured: true,
      flags: { NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true" },
    });
    expect(statusOf("naver")).toBe("setup_required");
    expect(resolveOAuthProvider("naver")).toBeNull();
  });

  it("resolves to custom:<slug> with a valid slug", () => {
    setEnv({
      configured: true,
      flags: {
        NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID: "naver-oidc",
      },
    });
    expect(statusOf("naver")).toBe("enabled");
    expect(resolveOAuthProvider("naver")).toBe("custom:naver-oidc");
  });

  it.each([
    "Naver",
    "custom:evil",
    "a b",
    "-leading-dash",
    "https://evil.example",
    "a".repeat(64),
  ])("rejects invalid slug %j (naver stays setup_required)", (slug) => {
    setEnv({
      configured: true,
      flags: {
        NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID: slug,
      },
    });
    expect(statusOf("naver")).toBe("setup_required");
    expect(resolveOAuthProvider("naver")).toBeNull();
  });
});

describe("resolveOAuthProvider allowlist", () => {
  function enableEverything(): void {
    setEnv({
      configured: true,
      flags: {
        NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true",
        NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true",
        NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID: "naver-oidc",
      },
    });
  }

  it("resolves enabled built-in providers to their Supabase ids", () => {
    enableEverything();
    expect(resolveOAuthProvider("kakao")).toBe("kakao");
    expect(resolveOAuthProvider("google")).toBe("google");
  });

  it.each(["github", "custom:evil", "", "KAKAO", "kakao ", "naver-oidc"])(
    "never resolves arbitrary key %j, even with everything enabled",
    (key) => {
      enableEverything();
      expect(resolveOAuthProvider(key)).toBeNull();
    },
  );

  it("resolves nothing while disabled", () => {
    setEnv({ configured: true });
    expect(resolveOAuthProvider("kakao")).toBeNull();
    expect(resolveOAuthProvider("google")).toBeNull();
    expect(resolveOAuthProvider("naver")).toBeNull();
  });
});

describe("isPhoneAuthEnabled", () => {
  it("requires the flag AND a configured Supabase project", () => {
    setEnv({
      configured: true,
      flags: { NEXT_PUBLIC_AUTH_PHONE_ENABLED: "true" },
    });
    expect(isPhoneAuthEnabled()).toBe(true);

    setEnv({
      configured: false,
      flags: { NEXT_PUBLIC_AUTH_PHONE_ENABLED: "true" },
    });
    expect(isPhoneAuthEnabled()).toBe(false);

    setEnv({ configured: true });
    expect(isPhoneAuthEnabled()).toBe(false);
  });
});

describe("buildOAuthRedirectTo", () => {
  const ORIGIN = "http://localhost:3000";

  it("omits next for the default target", () => {
    expect(buildOAuthRedirectTo(ORIGIN)).toBe(`${ORIGIN}/auth/callback`);
    expect(buildOAuthRedirectTo(ORIGIN, "/dashboard")).toBe(
      `${ORIGIN}/auth/callback`,
    );
  });

  it("carries a safe next path, encoded", () => {
    expect(buildOAuthRedirectTo(ORIGIN, "/jobs?a=1")).toBe(
      `${ORIGIN}/auth/callback?next=%2Fjobs%3Fa%3D1`,
    );
  });

  it("drops unsafe next values back to the canonical callback", () => {
    expect(buildOAuthRedirectTo(ORIGIN, "//evil.example")).toBe(
      `${ORIGIN}/auth/callback`,
    );
    expect(buildOAuthRedirectTo(ORIGIN, "https://evil.example")).toBe(
      `${ORIGIN}/auth/callback`,
    );
  });
});

describe("startOAuthSignIn", () => {
  function fakeAuth(error: unknown = null): {
    auth: OAuthAuthClient;
    spy: ReturnType<typeof vi.fn>;
  } {
    const spy = vi.fn(async () => ({ error }));
    return { auth: { signInWithOAuth: spy }, spy };
  }

  it("calls signInWithOAuth with the resolved provider and callback redirect", async () => {
    setEnv({
      configured: true,
      flags: { NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true" },
    });
    const { auth, spy } = fakeAuth();
    const result = await startOAuthSignIn(auth, "kakao", {
      origin: "http://localhost:3000",
      next: "/jobs",
    });
    expect(result).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      provider: "kakao",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=%2Fjobs",
      },
    });
  });

  it("never calls Supabase for unknown or disabled keys", async () => {
    setEnv({ configured: true });
    const { auth, spy } = fakeAuth();
    for (const key of ["kakao", "github", "custom:evil", ""]) {
      const result = await startOAuthSignIn(auth, key, {
        origin: "http://localhost:3000",
      });
      expect(result).toEqual({
        ok: false,
        message: SOCIAL_AUTH_MESSAGES.unsupported,
      });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps a Supabase error to the generic failure message", async () => {
    setEnv({
      configured: true,
      flags: { NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" },
    });
    const { auth } = fakeAuth({ message: "provider unavailable" });
    const result = await startOAuthSignIn(auth, "google", {
      origin: "http://localhost:3000",
    });
    expect(result).toEqual({
      ok: false,
      message: SOCIAL_AUTH_MESSAGES.startFailed,
    });
  });
});
