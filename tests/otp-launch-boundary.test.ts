import { afterEach, expect, it, vi } from "vitest";
import { requestPhoneOtp, verifyPhoneOtpAction } from "@/lib/auth/otp-actions";

// Exercise the real exported actions without a Next request context: the launch
// gate must reject before accessing request headers, cookies, counters, or Auth.
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  ["production", ""],
  ["development", "preview"],
  ["test", "production"],
])("rejects direct OTP actions in %s / %s despite the enabled flag", async (runtime, deployment) => {
  vi.stubEnv("NODE_ENV", runtime);
  vi.stubEnv("VERCEL_ENV", deployment);
  vi.stubEnv("NEXT_PUBLIC_AUTH_PHONE_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://otp-launch.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-otp-launch-test");
  const request = vi.fn(() => { throw new Error("Unexpected provider request"); });
  vi.stubGlobal("fetch", request);
  await expect(requestPhoneOtp("+12135550100")).resolves.toMatchObject({ status: "error" });
  await expect(verifyPhoneOtpAction("+12135550100", "123456", "/dashboard")).resolves.toMatchObject({ status: "error" });
  expect(request).not.toHaveBeenCalled();
});
