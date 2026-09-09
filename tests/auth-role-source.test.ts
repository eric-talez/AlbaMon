import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 4 security property: runtime role comes from `profiles.role`, never from
 * the client-influenced `user_metadata.role`. A Supabase-authenticated user
 * without a usable profile row is treated as unauthenticated (fail closed).
 *
 * This unit suite mocks the server boundary; separate pgTAP/browser tests use local Supabase. A single mock drives
 * both `getCurrentUser` (auth.getUser) and `getAuthProfileForUser` (the
 * profiles query), exercising the real integration between them.
 */

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthProfileForUser } from "@/lib/db/profiles";

const mockClient = vi.mocked(createSupabaseServerClient);

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";

type FakeUser = { id: string; email?: string; email_confirmed_at?: string; user_metadata?: unknown } | null;
type FakeProfile = { role: string } | Record<string, unknown> | null;

/** Build a fake Supabase client that answers both auth and profiles queries. */
function fakeClient(opts: {
  user?: FakeUser;
  profile?: FakeProfile;
  profileError?: unknown;
  aal?: string | null;
  aalError?: unknown;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: opts.aal === undefined ? "aal1" : opts.aal }, error: opts.aalError ?? null }) },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.profile ?? null,
            error: opts.profileError ?? null,
          }),
        }),
      }),
    }),
  };
}

function useClient(opts: Parameters<typeof fakeClient>[0]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockClient.mockResolvedValue(fakeClient(opts) as any);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REAL_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", REAL_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("session.ts source guard", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "lib", "auth", "session.ts"),
    "utf8",
  );

  it("reads the role from the profiles helper", () => {
    expect(src).toContain("getAuthProfileForUser");
    expect(src).toContain("@/lib/db/profiles");
  });

  it("never assigns the role from user_metadata", () => {
    // The role must not be derived from the client-influenced metadata bag.
    expect(src).not.toMatch(/role\s*=\s*[^=\n;]*user_metadata/i);
  });
});

describe("getAuthProfileForUser", () => {
  it("returns the role from the profiles row", async () => {
    useClient({ profile: { role: "employer", account_status: "active", display_name: "Kim" } });
    expect(await getAuthProfileForUser("u1")).toEqual({ role: "employer", accountStatus: "active", displayName: "Kim" });
  });

  it("returns null when the profile row is missing", async () => {
    useClient({ profile: null });
    expect(await getAuthProfileForUser("u1")).toBeNull();
  });

  it("returns null on a query error", async () => {
    useClient({ profileError: new Error("boom") });
    expect(await getAuthProfileForUser("u1")).toBeNull();
  });

  it("returns null for an unrecognized stored role", async () => {
    useClient({ profile: { role: "superuser" } });
    expect(await getAuthProfileForUser("u1")).toBeNull();
  });
});

describe("getCurrentUser — Supabase configured", () => {
  it("uses the profile role for an authenticated user", async () => {
    useClient({
      user: { id: "u1", email: "e@x.com", email_confirmed_at: "2026-01-01" },
      profile: { role: "employer", account_status: "active", display_name: "Kim" },
    });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "e@x.com",
      role: "employer",
      isDev: false,
      aal: "aal1", accountStatus: "active", displayName: "Kim",
    });
  });

  it("ignores user_metadata.role entirely (no privilege escalation)", async () => {
    useClient({
      user: { id: "u1", email: "e@x.com", user_metadata: { role: "admin" } },
      profile: { role: "seeker", account_status: "active", display_name: null },
    });
    const user = await getCurrentUser();
    expect(user?.role).toBe("seeker");
  });

  it("fails closed (null) when the user has no profile row", async () => {
    useClient({ user: { id: "u1", email: "e@x.com", email_confirmed_at: "2026-01-01" }, profile: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when there is no authenticated user", async () => {
    useClient({ user: null });
    expect(await getCurrentUser()).toBeNull();
  });
});

it.each(["aal1", "aal2", null, "unknown"])("normalizes current session AAL %s", async (aal) => {
  useClient({ user: { id: "u1", email: "unconfirmed@example.invalid" }, profile: { role: "admin", account_status: "active", display_name: null }, aal });
  expect(await getCurrentUser()).toMatchObject({ aal: aal === "aal2" ? "aal2" : "aal1", email: "" });
});
it("does not grant aal2 when assurance lookup fails", async () => {
  useClient({ user: { id: "u1" }, profile: { role: "admin", account_status: "active", display_name: null }, aal: "aal2", aalError: new Error("failure") });
  expect(await getCurrentUser()).toMatchObject({ aal: "aal1" });
});
it("fails closed on an invalid account status", async () => {
  useClient({ user: { id: "u1" }, profile: { role: "admin", account_status: "bogus" } });
  expect(await getCurrentUser()).toBeNull();
});
