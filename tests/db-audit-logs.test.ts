import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecentAdminAuditLogs } from "@/lib/db/audit-logs";

const mockClient = vi.mocked(createSupabaseServerClient);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("recent admin audit logs", () => {
  it("maps the newest rows through a narrow select", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          id: "log-1",
          action: "job.approve",
          entity_type: "job",
          created_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "log-2",
          action: "company.verify",
          entity_type: "company",
          created_at: "2026-06-30T00:00:00Z",
        },
      ],
      error: null,
    });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getRecentAdminAuditLogs()).resolves.toEqual({
      status: "ok",
      entries: [
        {
          id: "log-1",
          action: "job.approve",
          entityType: "job",
          createdAt: "2026-07-01T00:00:00Z",
        },
        {
          id: "log-2",
          action: "company.verify",
          entityType: "company",
          createdAt: "2026-06-30T00:00:00Z",
        },
      ],
    });
    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(select).toHaveBeenCalledWith("id, action, entity_type, created_at");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(5);
  });

  it("returns an ok empty list when no activity exists yet", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ order: vi.fn(() => ({ limit })) })),
      })),
    } as never);

    await expect(getRecentAdminAuditLogs()).resolves.toEqual({
      status: "ok",
      entries: [],
    });
  });

  it("returns unavailable without querying when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(getRecentAdminAuditLogs()).resolves.toEqual({
      status: "unavailable",
    });
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("returns a safe error for query failures and client crashes", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    mockClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ order: vi.fn(() => ({ limit })) })),
      })),
    } as never);
    await expect(getRecentAdminAuditLogs()).resolves.toEqual({ status: "error" });

    mockClient.mockRejectedValue(new Error("private database detail"));
    await expect(getRecentAdminAuditLogs()).resolves.toEqual({ status: "error" });
  });
});
