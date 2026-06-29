import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateApplicationStatus } from "@/lib/db/applications";

const mockClient = vi.mocked(createSupabaseServerClient);

// A tiny chainable builder that records the operation and resolves the terminal
// maybeSingle() with a queued result. Mirrors the supabase-js fluent surface
// used by updateApplicationStatus (select/update -> eq -> [select] -> maybeSingle).
function makeClient(queue: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ op: "select" | "update"; payload?: unknown }> = [];
  let i = 0;
  function chain(op: "select" | "update", payload?: unknown) {
    calls.push({ op, payload });
    const node: Record<string, unknown> = {
      eq: () => node,
      select: () => node,
      maybeSingle: async () => queue[i++] ?? { data: null, error: null },
    };
    return node;
  }
  const client = {
    from: (table: string) => {
      expect(table).toBe("applications");
      return {
        select: (cols: string) => chain("select", cols),
        update: (payload: unknown) => chain("update", payload),
      };
    },
  };
  return { client, calls };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "sb_publishable_realish_key_value_1234567890",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("updateApplicationStatus", () => {
  it("reads the prior status, writes only status, and returns the transition", async () => {
    const { client, calls } = makeClient([
      { data: { status: "submitted" }, error: null },
      { data: { id: "application-1" }, error: null },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.mockResolvedValue(client as any);

    await expect(
      updateApplicationStatus("application-1", "interview"),
    ).resolves.toEqual({
      status: "updated",
      previousStatus: "submitted",
      nextStatus: "interview",
    });

    const update = calls.find((c) => c.op === "update");
    expect(update?.payload).toEqual({ status: "interview" });
  });

  it("resolves not_found when the caller cannot see the application", async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.mockResolvedValue(client as any);

    await expect(
      updateApplicationStatus("application-2", "reviewing"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("maps RLS/check violations on update to not_allowed", async () => {
    for (const code of ["42501", "23514", "23503"]) {
      const { client } = makeClient([
        { data: { status: "submitted" }, error: null },
        { data: null, error: { code } },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient.mockResolvedValue(client as any);

      await expect(
        updateApplicationStatus("application-3", "offered"),
      ).resolves.toEqual({ status: "not_allowed" });
    }
  });

  it("treats a zero-row update (filtered by RLS) as not_allowed", async () => {
    const { client } = makeClient([
      { data: { status: "submitted" }, error: null },
      { data: null, error: null },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.mockResolvedValue(client as any);

    await expect(
      updateApplicationStatus("application-4", "rejected"),
    ).resolves.toEqual({ status: "not_allowed" });
  });

  it("returns error on an unexpected database failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = makeClient([
      { data: { status: "submitted" }, error: null },
      { data: null, error: { code: "XX000" } },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.mockResolvedValue(client as any);

    await expect(
      updateApplicationStatus("application-5", "reviewing"),
    ).resolves.toEqual({ status: "error" });
  });

  it("never writes or mocks success when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(
      updateApplicationStatus("application-6", "reviewing"),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});
