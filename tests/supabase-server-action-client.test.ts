import { afterEach, describe, it, expect, vi } from "vitest";
import { SUPABASE_ANON_KEY } from "@/lib/supabase/config";

const setSpy = vi.fn();
const getAllSpy = vi.fn(() => [] as unknown[]);
const cookieStore = { getAll: getAllSpy, set: setSpy };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

type CapturedOpts = {
  cookies: { setAll: (list: { name: string; value: string; options: object }[]) => void };
};
let captured: { url: string; key: string; opts: CapturedOpts } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((url: string, key: string, opts: CapturedOpts) => {
    captured = { url, key, opts };
    return { auth: {} };
  }),
}));

import { createServerClient } from "@supabase/ssr";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

afterEach(() => {
  vi.clearAllMocks();
  getAllSpy.mockReturnValue([]);
  captured = null;
});

describe("createSupabaseServerActionClient", () => {
  it("builds the anon SSR client (never the service-role client)", async () => {
    await createSupabaseServerActionClient();
    expect(createServerClient).toHaveBeenCalledTimes(1);
    // Anon key, not the service role.
    expect(captured?.key).toBe(SUPABASE_ANON_KEY);
  });

  it("writes every returned session cookie", async () => {
    await createSupabaseServerActionClient();
    captured?.opts.cookies.setAll([
      { name: "sb-access-token", value: "a", options: { path: "/" } },
      { name: "sb-refresh-token", value: "b", options: { path: "/", httpOnly: true } },
    ]);
    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy).toHaveBeenNthCalledWith(1, "sb-access-token", "a", { path: "/" });
    expect(setSpy).toHaveBeenNthCalledWith(2, "sb-refresh-token", "b", {
      path: "/",
      httpOnly: true,
    });
  });

  it("does NOT swallow a cookie-write failure (it surfaces)", async () => {
    setSpy.mockImplementationOnce(() => {
      throw new Error("cannot set cookies here");
    });
    await createSupabaseServerActionClient();
    expect(() =>
      captured?.opts.cookies.setAll([{ name: "sb", value: "v", options: {} }]),
    ).toThrow("cannot set cookies here");
  });
});
