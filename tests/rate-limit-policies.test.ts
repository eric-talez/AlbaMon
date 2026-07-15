import { describe, it, expect } from "vitest";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit/policies";

const ALL = Object.values(RATE_LIMIT_POLICIES);

describe("rate-limit policy registry", () => {
  it("every policy has a DB-valid scope and positive bounded window", () => {
    for (const p of ALL) {
      expect(p.scope, p.scope).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(p.scope.length).toBeLessThanOrEqual(100);
      expect(p.maxAttempts).toBeGreaterThanOrEqual(1);
      expect(p.maxAttempts).toBeLessThanOrEqual(10000);
      expect(p.windowSeconds).toBeGreaterThanOrEqual(1);
      expect(p.windowSeconds).toBeLessThanOrEqual(86400);
    }
  });

  it("scopes are unique", () => {
    const scopes = ALL.map((p) => p.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it("matches the approved initial limits exactly", () => {
    const P = RATE_LIMIT_POLICIES;
    // OTP send
    expect(P.otpSendPerIp).toEqual({ scope: "otp_send_ip", maxAttempts: 10, windowSeconds: 900 });
    expect(P.otpSendPerPhone).toEqual({ scope: "otp_send_phone", maxAttempts: 3, windowSeconds: 900 });
    expect(P.otpSendPerPhoneDaily).toEqual({ scope: "otp_send_phone_daily", maxAttempts: 10, windowSeconds: 86400 });
    // OTP verify
    expect(P.otpVerifyPerIp).toEqual({ scope: "otp_verify_ip", maxAttempts: 30, windowSeconds: 900 });
    expect(P.otpVerifyPerPhone).toEqual({ scope: "otp_verify_phone", maxAttempts: 10, windowSeconds: 900 });
    // Authenticated writes
    expect(P.submitApplication).toEqual({ scope: "app_submit_user", maxAttempts: 10, windowSeconds: 3600 });
    expect(P.createReport).toEqual({ scope: "report_create_user", maxAttempts: 5, windowSeconds: 3600 });
    expect(P.sendMessage).toEqual({ scope: "message_send_user", maxAttempts: 30, windowSeconds: 60 });
    expect(P.employerAccessRequest).toEqual({ scope: "employer_access_request_user", maxAttempts: 3, windowSeconds: 86400 });
    expect(P.createJob).toEqual({ scope: "job_create_employer", maxAttempts: 20, windowSeconds: 86400 });
    expect(P.createCompany).toEqual({ scope: "company_create_employer", maxAttempts: 5, windowSeconds: 86400 });
  });
});
