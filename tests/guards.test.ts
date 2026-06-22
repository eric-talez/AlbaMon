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

import { requireRole } from "@/lib/auth/guards";

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
    });
    await expect(requireRole("employer")).rejects.toThrow("REDIRECT:/forbidden");
  });

  it("returns a user whose runtime role matches exactly", async () => {
    const user = {
      id: "employer-1",
      email: "employer@example.com",
      role: "employer" as const,
      isDev: false,
    };
    mocks.getCurrentUser.mockResolvedValue(user);
    await expect(requireRole("employer")).resolves.toEqual(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
