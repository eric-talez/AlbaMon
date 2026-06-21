import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createApplication } from "@/lib/db/applications";

const mockClient = vi.mocked(createSupabaseServerClient);
const insert = vi.fn();

beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://abcdefghijklmnop.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "sb_publishable_realish_key_value_1234567890",
  );
  insert.mockReset();
  mockClient.mockResolvedValue({
    from: (table: string) => {
      expect(table).toBe("applications");
      return { insert };
    },
    // The helper exercises only the minimal insert surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createApplication", () => {
  it("inserts only trusted application fields and omits status", async () => {
    insert.mockResolvedValue({ error: null });

    await expect(createApplication("job-1", "user-1", "Hello")).resolves.toBe(
      "created",
    );
    expect(insert).toHaveBeenCalledWith({
      job_id: "job-1",
      seeker_id: "user-1",
      cover_note: "Hello",
    });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("maps duplicate, RLS, FK, and check errors", async () => {
    for (const [code, expected] of [
      ["23505", "duplicate"],
      ["42501", "not_allowed"],
      ["23503", "not_allowed"],
      ["23514", "not_allowed"],
    ] as const) {
      insert.mockResolvedValueOnce({ error: { code } });
      await expect(createApplication("job-1", "user-1", null)).resolves.toBe(
        expected,
      );
    }
  });

  it("returns error for unexpected database failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    insert.mockResolvedValue({ error: { code: "XX000" } });
    await expect(createApplication("job-1", "user-1", null)).resolves.toBe(
      "error",
    );
  });

  it("never writes or mocks success when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(createApplication("job-1", "user-1", null)).resolves.toBe(
      "unavailable",
    );
    expect(mockClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
