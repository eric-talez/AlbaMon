import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 4 security property: runtime role comes from `profiles.role`, never from
 * the client-influenced `user_metadata.role`. A Supabase-authenticated user
 * without a usable profile row is treated as unauthenticated (fail closed).
 *
 * No live Supabase exists, so we mock the server client. A single mock drives
 * both `getCurrentUser` (auth.getUser) and `getProfileRoleForUser` (the
 * profiles query), exercising the real integration between them.
 */

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getProfileRoleForUser } from "@/lib/db/profiles";

const mockClient = vi.mocked(createSupabaseServerClient);

const REAL_URL = "https://abcdefghijklmnop.supabase.co";
const REAL_KEY = "sb_publishable_realisha_key_value_1234567890";

type FakeUser = { id: string; email?: string; user_metadata?: unknown } | null;
type FakeProfile = { role: string } | Record<string, unknown> | null;

/** Build a fake Supabase client that answers both auth and profiles queries. */
function fakeClient(opts: {
  user?: FakeUser;
  profile?: FakeProfile;
  profileError?: unknown;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
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
    expect(src).toContain("getProfileRoleForUser");
    expect(src).toContain("@/lib/db/profiles");
  });

  it("never assigns the role from user_metadata", () => {
    // The role must not be derived from the client-influenced metadata bag.
    expect(src).not.toMatch(/role\s*=\s*[^=\n;]*user_metadata/i);
  });
});

describe("getProfileRoleForUser", () => {
  it("returns the role from the profiles row", async () => {
    useClient({ profile: { role: "employer" } });
    expect(await getProfileRoleForUser("u1")).toBe("employer");
  });

  it("returns null when the profile row is missing", async () => {
    useClient({ profile: null });
    expect(await getProfileRoleForUser("u1")).toBeNull();
  });

  it("returns null on a query error", async () => {
    useClient({ profileError: new Error("boom") });
    expect(await getProfileRoleForUser("u1")).toBeNull();
  });

  it("returns null for an unrecognized stored role", async () => {
    useClient({ profile: { role: "superuser" } });
    expect(await getProfileRoleForUser("u1")).toBeNull();
  });
});

describe("getCurrentUser — Supabase configured", () => {
  it("uses the profile role for an authenticated user", async () => {
    useClient({
      user: { id: "u1", email: "e@x.com" },
      profile: { role: "employer" },
    });
    expect(await getCurrentUser()).toEqual({
      id: "u1",
      email: "e@x.com",
      role: "employer",
      isDev: false,
    });
  });

  it("ignores user_metadata.role entirely (no privilege escalation)", async () => {
    useClient({
      user: { id: "u1", email: "e@x.com", user_metadata: { role: "admin" } },
      profile: { role: "seeker" },
    });
    const user = await getCurrentUser();
    expect(user?.role).toBe("seeker");
  });

  it("fails closed (null) when the user has no profile row", async () => {
    useClient({ user: { id: "u1", email: "e@x.com" }, profile: null });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null when there is no authenticated user", async () => {
    useClient({ user: null });
    expect(await getCurrentUser()).toBeNull();
  });
});
