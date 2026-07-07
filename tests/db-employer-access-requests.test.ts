import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createEmployerAccessRequest,
  getAdminEmployerAccessRequests,
  getLatestEmployerAccessRequest,
  getPendingEmployerAccessRequestCount,
  reviewEmployerAccessRequest,
} from "@/lib/db/employer-access-requests";
import type { EmployerAccessRequestInput } from "@/lib/employer-access/validation";

const mockClient = vi.mocked(createSupabaseServerClient);

const INPUT: EmployerAccessRequestInput = {
  businessName: "K-Work Cafe",
  contactName: "Eric Kim",
  phone: "213-555-0100",
  website: "https://kworkcafe.example",
  city: "Los Angeles",
  state: "CA",
  reason: "We are hiring baristas.",
};

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    requester_id: "seeker-1",
    business_name: "K-Work Cafe",
    contact_name: "Eric Kim",
    phone: null,
    website: null,
    city: "Los Angeles",
    state: "CA",
    reason: null,
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    ...overrides,
  };
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

describe("createEmployerAccessRequest", () => {
  it("inserts a pending request for the requester through the user session", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "req-1" }, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const from = vi.fn(() => ({ insert }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(createEmployerAccessRequest("seeker-1", INPUT)).resolves.toEqual({
      status: "ok",
      requestId: "req-1",
    });
    expect(from).toHaveBeenCalledWith("employer_access_requests");
    expect(insert).toHaveBeenCalledWith({
      requester_id: "seeker-1",
      business_name: "K-Work Cafe",
      contact_name: "Eric Kim",
      phone: "213-555-0100",
      website: "https://kworkcafe.example",
      city: "Los Angeles",
      state: "CA",
      reason: "We are hiring baristas.",
      status: "pending",
    });
  });

  it("maps duplicate-pending and RLS/check failures to safe outcomes", async () => {
    for (const [code, expected] of [
      ["23505", "duplicate_pending"],
      ["23514", "not_allowed"],
      ["42501", "not_allowed"],
      ["23503", "not_allowed"],
    ] as const) {
      const single = vi.fn().mockResolvedValue({ data: null, error: { code } });
      const from = vi.fn(() => ({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      }));
      mockClient.mockResolvedValue({ from } as never);

      await expect(
        createEmployerAccessRequest("seeker-1", INPUT),
      ).resolves.toEqual({ status: expected });
    }
  });

  it("returns unavailable and never writes when Supabase is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(createEmployerAccessRequest("seeker-1", INPUT)).resolves.toEqual({
      status: "unavailable",
    });
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("getLatestEmployerAccessRequest", () => {
  it("returns the newest own request as a summary", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: requestRow({ status: "rejected", reviewed_at: "2026-07-06T01:00:00Z" }),
      error: null,
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getLatestEmployerAccessRequest("seeker-1")).resolves.toEqual({
      status: "ok",
      request: {
        id: "req-1",
        businessName: "K-Work Cafe",
        city: "Los Angeles",
        state: "CA",
        status: "rejected",
        createdAt: "2026-07-06T00:00:00Z",
        reviewedAt: "2026-07-06T01:00:00Z",
      },
    });
    expect(eq).toHaveBeenCalledWith("requester_id", "seeker-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("returns null when the user has no requests", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getLatestEmployerAccessRequest("seeker-1")).resolves.toEqual({
      status: "ok",
      request: null,
    });
  });
});

describe("getAdminEmployerAccessRequests", () => {
  it("sorts pending requests first (newest first) and joins requester identity", async () => {
    const rows = [
      requestRow({
        id: "req-approved",
        status: "approved",
        reviewed_at: "2026-07-05T00:00:00Z",
        created_at: "2026-07-05T00:00:00Z",
      }),
      requestRow({ id: "req-new-pending", created_at: "2026-07-04T00:00:00Z" }),
      requestRow({ id: "req-old-pending", created_at: "2026-07-01T00:00:00Z" }),
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const inFilter = vi.fn().mockResolvedValue({
      data: [
        { id: "seeker-1", display_name: "Eric", email: "seeker@example.com" },
      ],
      error: null,
    });
    const from = vi.fn((table: string) =>
      table === "employer_access_requests"
        ? { select: vi.fn(() => ({ order })) }
        : { select: vi.fn(() => ({ in: inFilter })) },
    );
    mockClient.mockResolvedValue({ from } as never);

    const result = await getAdminEmployerAccessRequests();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.requests.map((request) => request.id)).toEqual([
      "req-new-pending",
      "req-old-pending",
      "req-approved",
    ]);
    expect(result.requests[0].requesterEmail).toBe("seeker@example.com");
    expect(result.requests[0].requesterDisplayName).toBe("Eric");
    expect(inFilter).toHaveBeenCalledWith("id", ["seeker-1"]);
  });
});

describe("getPendingEmployerAccessRequestCount", () => {
  it("counts only pending requests without fetching rows", async () => {
    const eq = vi.fn().mockResolvedValue({ count: 4, error: null });
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockClient.mockResolvedValue({ from } as never);

    await expect(getPendingEmployerAccessRequestCount()).resolves.toEqual({
      status: "ok",
      count: 4,
    });
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("status", "pending");
  });
});

describe("reviewEmployerAccessRequest", () => {
  it("delegates decisions to the admin-only SQL function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "approved", error: null });
    mockClient.mockResolvedValue({ rpc } as never);

    await expect(
      reviewEmployerAccessRequest("req-1", "approved"),
    ).resolves.toEqual({ status: "ok", decision: "approved" });
    expect(rpc).toHaveBeenCalledWith("review_employer_access_request", {
      request_id: "req-1",
      decision: "approved",
    });
  });

  it("maps already-reviewed requests to a conflict", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "conflict", error: null });
    mockClient.mockResolvedValue({ rpc } as never);

    await expect(
      reviewEmployerAccessRequest("req-1", "rejected"),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("maps the function's admin gate to not_allowed", async () => {
    for (const code of ["P0001", "42501"]) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { code } });
      mockClient.mockResolvedValue({ rpc } as never);

      await expect(
        reviewEmployerAccessRequest("req-1", "approved"),
      ).resolves.toEqual({ status: "not_allowed" });
    }
  });

  it("returns unavailable without calling the function when unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(
      reviewEmployerAccessRequest("req-1", "approved"),
    ).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });
});
