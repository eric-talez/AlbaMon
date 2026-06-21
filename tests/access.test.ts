import { describe, it, expect } from "vitest";
import {
  evaluateAccess,
  canAccess,
  roleHome,
  AREAS,
  type Area,
  type AccessResult,
} from "@/lib/auth/access";
import { ROLES, type Role } from "@/lib/types";

describe("evaluateAccess — permission matrix", () => {
  // Expected result for every (actor, area) pair. `null` actor = signed out.
  const matrix: Record<"anon" | Role, Record<Area, AccessResult>> = {
    anon: {
      public: "ok",
      dashboard: "unauthenticated",
      employer: "unauthenticated",
      admin: "unauthenticated",
    },
    seeker: {
      public: "ok",
      dashboard: "ok",
      employer: "forbidden",
      admin: "forbidden",
    },
    employer: {
      public: "ok",
      dashboard: "ok",
      employer: "ok",
      admin: "forbidden",
    },
    admin: {
      public: "ok",
      dashboard: "ok",
      employer: "ok",
      admin: "ok",
    },
  };

  for (const actor of ["anon", ...ROLES] as const) {
    for (const area of AREAS) {
      const role = actor === "anon" ? null : (actor as Role);
      const expected = matrix[actor][area];
      it(`${actor} → ${area} = ${expected}`, () => {
        expect(evaluateAccess(role, area)).toBe(expected);
      });
    }
  }
});

describe("access invariants", () => {
  it("seekers can never reach employer or admin areas", () => {
    expect(canAccess("seeker", "employer")).toBe(false);
    expect(canAccess("seeker", "admin")).toBe(false);
  });

  it("employers can never reach admin areas", () => {
    expect(canAccess("employer", "admin")).toBe(false);
  });

  it("admins can reach every area", () => {
    for (const area of AREAS) expect(canAccess("admin", area)).toBe(true);
  });

  it("anonymous users are blocked from all non-public areas", () => {
    for (const area of AREAS) {
      if (area === "public") continue;
      expect(canAccess(null, area)).toBe(false);
    }
  });

  it("maps each role to its home route", () => {
    expect(roleHome("seeker")).toBe("/dashboard");
    expect(roleHome("employer")).toBe("/employer");
    expect(roleHome("admin")).toBe("/admin");
  });
});
