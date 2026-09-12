import { acknowledgedPolicies } from "./fixtures/policies";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { requireArea, requireEmployerAreaAccess, requireRole } from "@/lib/auth/guards";

afterEach(() => vi.clearAllMocks());

describe("requireRole", () => {
  it("preserves the login destination for unauthenticated users", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(requireRole("seeker", "/dashboard/applications")).rejects.toThrow(
      "REDIRECT:/login?next=%2Fdashboard%2Fapplications",
    );
  });

  it("forbids authenticated users with a different runtime role", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      isDev: false,
      aal: "aal2" as const, ...acknowledgedPolicies, accountStatus: "active" as const, displayName: null,
    });
    await expect(requireRole("employer")).rejects.toThrow("REDIRECT:/forbidden");
  });

  it("returns a user whose runtime role matches exactly", async () => {
    const user = {
      id: "employer-1",
      email: "employer@example.com",
      role: "employer" as const,
      isDev: false,
      aal: "aal2" as const, ...acknowledgedPolicies, accountStatus: "active" as const, displayName: null,
    };
    mocks.getCurrentUser.mockResolvedValue(user);
    await expect(requireRole("employer")).resolves.toEqual(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("requireEmployerAreaAccess", () => {
  it("preserves the login destination for unauthenticated users", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(requireEmployerAreaAccess("/employer")).rejects.toThrow(
      "REDIRECT:/login?next=%2Femployer",
    );
  });

  it("routes seekers to the employer access request flow, not a dead end", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "seeker-1",
      email: "seeker@example.com",
      role: "seeker",
      isDev: false,
      aal: "aal2" as const, ...acknowledgedPolicies, accountStatus: "active" as const, displayName: null,
    });
    await expect(requireEmployerAreaAccess("/employer")).rejects.toThrow(
      "REDIRECT:/employer/request-access",
    );
  });

  it("passes employers and admins through unchanged", async () => {
    for (const role of ["employer", "admin"] as const) {
      const user = {
        id: `${role}-1`,
        email: `${role}@example.com`,
        role,
        isDev: false,
        aal: "aal2" as const, ...acknowledgedPolicies, accountStatus: "active" as const, displayName: null,
      };
      mocks.getCurrentUser.mockResolvedValue(user);
      await expect(requireEmployerAreaAccess("/employer")).resolves.toEqual(user);
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

 it("routes admin aal1 to security and denies suspended admin aal2", async () => {
   mocks.getCurrentUser.mockResolvedValue({ role: "admin", aal: "aal1", ...acknowledgedPolicies, accountStatus: "active" });
   await expect(requireRole("admin")).rejects.toThrow("REDIRECT:/account/security");
   mocks.getCurrentUser.mockResolvedValue({ role: "admin", aal: "aal2", ...acknowledgedPolicies, accountStatus: "suspended" });
   await expect(requireRole("admin")).rejects.toThrow("REDIRECT:/forbidden");
   mocks.getCurrentUser.mockResolvedValue({ role: "admin", aal: "aal2", ...acknowledgedPolicies, accountStatus: "active" });
   await expect(requireRole("admin")).resolves.toMatchObject({ aal: "aal2" });
 });

it("the generic admin area guard also requires session MFA", async () => {
  mocks.getCurrentUser.mockResolvedValue({ role: "admin", aal: "aal1", ...acknowledgedPolicies, accountStatus: "active" });
  await expect(requireArea("admin")).rejects.toThrow("REDIRECT:/account/security");
});
