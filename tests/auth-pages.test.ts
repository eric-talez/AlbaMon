import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

/**
 * Slice 19 auth surface smoke: /login and /signup render the social buttons,
 * the phone OTP section, and — in unconfigured dev mode — the dev role
 * picker, across every configuration state, without crashing and without
 * echoing raw error codes.
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

const ALL_ON = {
  NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "true",
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
  NEXT_PUBLIC_AUTH_NAVER_ENABLED: "true",
  NEXT_PUBLIC_AUTH_NAVER_PROVIDER_ID: "naver-oidc",
  NEXT_PUBLIC_AUTH_PHONE_ENABLED: "true",
} as const;

type PageProps = { next?: string; error?: string };

async function renderLogin(params: PageProps = {}): Promise<string> {
  return renderToStaticMarkup(
    await LoginPage({ searchParams: Promise.resolve(params) }),
  );
}

async function renderSignup(params: PageProps = {}): Promise<string> {
  return renderToStaticMarkup(
    await SignupPage({ searchParams: Promise.resolve(params) }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("unconfigured local mode (dev auth)", () => {
  it("login renders the dev role picker plus setup-required social/phone states", async () => {
    setEnv({ configured: false });
    const html = await renderLogin();

    // Real heading + dev subsection coexist.
    expect(html).toContain("<h1");
    expect(html).toContain("개발 모드 로그인 (Dev mode)");
    expect(html).toContain('name="role"');

    // All three social providers are visible but setup-required.
    expect(html).toContain("카카오톡으로 계속하기");
    expect(html).toContain("Google로 계속하기");
    expect(html).toContain("네이버로 계속하기");
    expect(html).toContain("아직 설정되지 않은 로그인 방식입니다");

    // Phone OTP shows the setup note, not the form.
    expect(html).toContain("SMS 설정 후");
    expect(html).not.toContain('id="phone-otp-number"');

    // The retired "coming soon" notice is gone; cross-link is present.
    expect(html).not.toContain("다음 단계에서 제공됩니다");
    expect(html).toContain('href="/signup"');
  });

  it("signup renders the same surface with the signup heading", async () => {
    setEnv({ configured: false });
    const html = await renderSignup();
    expect(html).toContain("회원가입");
    expect(html).toContain("개발 모드 로그인 (Dev mode)");
    expect(html).toContain("카카오톡으로 계속하기");
    expect(html).toContain("SMS 설정 후");
    expect(html).toContain('href="/login"');
  });

  it("passes the next param through to the dev form", async () => {
    setEnv({ configured: false });
    const html = await renderLogin({ next: "/jobs" });
    expect(html).toContain('name="next"');
    expect(html).toContain('value="/jobs"');
  });
});

describe("configured mode with all providers enabled", () => {
  it("login shows enabled social buttons and the phone form; no dev picker", async () => {
    setEnv({ configured: true, flags: ALL_ON });
    const html = await renderLogin();

    expect(html).not.toContain("개발 모드");
    expect(html).toContain("카카오톡으로 계속하기");
    expect(html).toContain("Google로 계속하기");
    expect(html).toContain("네이버로 계속하기");
    expect(html).not.toContain("아직 설정되지 않은 로그인 방식입니다");

    expect(html).toContain("휴대폰으로 로그인");
    expect(html).toContain('id="phone-otp-number"');
    expect(html).toContain("인증번호 받기");
    expect(html).not.toContain("SMS 설정 후");
  });

  it("signup shows the same enabled surface", async () => {
    setEnv({ configured: true, flags: ALL_ON });
    const html = await renderSignup();
    expect(html).not.toContain("개발 모드");
    expect(html).toContain("네이버로 계속하기");
    expect(html).toContain('id="phone-otp-number"');
  });

  it("treats non-true flag values as off", async () => {
    setEnv({
      configured: true,
      flags: {
        NEXT_PUBLIC_AUTH_KAKAO_ENABLED: "yes",
        NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "1",
        NEXT_PUBLIC_AUTH_PHONE_ENABLED: "TRUE",
      },
    });
    const html = await renderLogin();
    expect(html).toContain("아직 설정되지 않은 로그인 방식입니다");
    expect(html).toContain("SMS 설정 후");
  });
});

describe("error notices", () => {
  it("maps use_real_auth to its specific message", async () => {
    setEnv({ configured: true, flags: ALL_ON });
    const html = await renderLogin({ error: "use_real_auth" });
    expect(html).toContain("개발 모드 로그인은 사용할 수 없습니다");
  });

  it("maps unknown codes to the generic message without echoing them", async () => {
    setEnv({ configured: false });
    const html = await renderLogin({ error: "weird_value" });
    expect(html).toContain("로그인 처리 중 문제가 발생했습니다");
    expect(html).not.toContain("weird_value");
  });
});

describe("SocialAuthButtons rendering states", () => {
  it("renders enabled buttons clickable and setup-required buttons disabled", () => {
    const html = renderToStaticMarkup(
      createElement(SocialAuthButtons, {
        providers: [
          { key: "kakao", label: "카카오톡으로 계속하기", status: "enabled" },
          { key: "naver", label: "네이버로 계속하기", status: "setup_required" },
        ],
        next: "/jobs",
      }),
    );
    const buttons = html.split("<button");
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toContain("카카오톡으로 계속하기");
    expect(buttons[1]).not.toContain('disabled=""');
    expect(buttons[2]).toContain("네이버로 계속하기");
    expect(buttons[2]).toContain('disabled=""');
  });
});
