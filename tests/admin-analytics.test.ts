import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminAnalytics } from "@/lib/db/admin-analytics";

const mockClient = vi.mocked(createSupabaseServerClient);

interface FakeCountResponse {
  count: number | null;
  error: unknown;
}

interface FakeBuilder extends PromiseLike<FakeCountResponse> {
  eq(column: string, value: string | boolean): FakeBuilder;
  gte(column: string, value: string): FakeBuilder;
}

interface FilterCall {
  kind: "eq" | "gte";
  column: string;
  value: string | boolean;
}

interface CountCall {
  table: string;
  selected: string;
  options: { count: string; head: boolean };
  filters: FilterCall[];
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_realish_key_value_1234567890");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("admin analytics reads", () => {
  it("returns unavailable without querying when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "your-anon-key");

    await expect(getAdminAnalytics()).resolves.toEqual({ status: "unavailable" });
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("returns aggregate KPI counts with status mappings", async () => {
    const now = new Date("2026-06-29T00:00:00.000Z");
    const counts = {
      [keyOf("jobs")]: 12,
      [keyOf("jobs", eq("moderation_status", "draft"))]: 1,
      [keyOf("jobs", eq("moderation_status", "pending"))]: 2,
      [keyOf("jobs", eq("moderation_status", "approved"))]: 4,
      [keyOf("jobs", eq("moderation_status", "rejected"))]: 1,
      [keyOf("jobs", eq("moderation_status", "paused"))]: 2,
      [keyOf("jobs", eq("moderation_status", "expired"))]: 2,
      [keyOf("jobs", gte("created_at", "2026-06-22T00:00:00.000Z"))]: 5,
      [keyOf("jobs", gte("created_at", "2026-05-30T00:00:00.000Z"))]: 8,
      [keyOf("applications")]: 20,
      [keyOf("applications", eq("status", "submitted"))]: 6,
      [keyOf("applications", eq("status", "reviewing"))]: 5,
      [keyOf("applications", eq("status", "interview"))]: 4,
      [keyOf("applications", eq("status", "offered"))]: 2,
      [keyOf("applications", eq("status", "rejected"))]: 2,
      [keyOf("applications", eq("status", "withdrawn"))]: 1,
      [keyOf("applications", gte("created_at", "2026-06-22T00:00:00.000Z"))]: 7,
      [keyOf("applications", gte("created_at", "2026-05-30T00:00:00.000Z"))]: 15,
      [keyOf("companies")]: 9,
      [keyOf("companies", eq("is_verified", true))]: 6,
      [keyOf("companies", eq("is_verified", false))]: 3,
      [keyOf("companies", gte("created_at", "2026-05-30T00:00:00.000Z"))]: 4,
      [keyOf("reports")]: 7,
      [keyOf("reports", eq("status", "open"))]: 3,
      [keyOf("reports", eq("status", "reviewed"))]: 2,
      [keyOf("reports", eq("status", "dismissed"))]: 2,
      [keyOf("reports", gte("created_at", "2026-06-22T00:00:00.000Z"))]: 2,
      [keyOf("reports", gte("created_at", "2026-05-30T00:00:00.000Z"))]: 6,
      [keyOf("messages")]: 11,
      [keyOf("messages", gte("created_at", "2026-06-22T00:00:00.000Z"))]: 4,
      [keyOf("messages", gte("created_at", "2026-05-30T00:00:00.000Z"))]: 10,
    };
    const { client, calls } = makeCountClient(counts);
    mockClient.mockResolvedValue(client as never);

    await expect(getAdminAnalytics(now)).resolves.toMatchObject({
      status: "ok",
      analytics: {
        jobs: {
          total: 12,
          byStatus: {
            draft: 1,
            pending: 2,
            approved: 4,
            rejected: 1,
            paused: 2,
            expired: 2,
          },
          createdLast7Days: 5,
          createdLast30Days: 8,
        },
        applications: {
          total: 20,
          byStatus: {
            submitted: 6,
            reviewing: 5,
            interview: 4,
            offered: 2,
            rejected: 2,
            withdrawn: 1,
          },
          createdLast7Days: 7,
          createdLast30Days: 15,
        },
        companies: {
          total: 9,
          verified: 6,
          unverified: 3,
          createdLast30Days: 4,
        },
        reports: {
          total: 7,
          byStatus: { open: 3, reviewed: 2, dismissed: 2 },
          createdLast7Days: 2,
          createdLast30Days: 6,
        },
        messages: {
          total: 11,
          createdLast7Days: 4,
          createdLast30Days: 10,
        },
      },
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "messages",
          selected: "id",
          options: { count: "exact", head: true },
        }),
        expect.objectContaining({
          table: "applications",
          selected: "id",
          options: { count: "exact", head: true },
        }),
      ]),
    );
  });

  it("returns a safe error if an aggregate read fails", async () => {
    const { client } = makeCountClient({}, keyOf("jobs"));
    mockClient.mockResolvedValue(client as never);

    await expect(getAdminAnalytics()).resolves.toEqual({ status: "error" });
  });
});

describe("admin analytics static security boundaries", () => {
  it("uses caller-authenticated aggregate reads and selects no private details", () => {
    const source = read("src/lib/db/admin-analytics.ts");
    expect(source).toContain("createSupabaseServerClient");
    expect(source).toContain('.select("id", { count: "exact", head: true })');
    expect(source).not.toMatch(/service.?role/i);
    expect(source).not.toMatch(/body|cover_note|seeker_id|sender_id|reporter_id|details/i);
  });
});

function makeCountClient(
  counts: Record<string, number>,
  errorKey?: string,
): { client: { from: ReturnType<typeof vi.fn> }; calls: CountCall[] } {
  const calls: CountCall[] = [];
  const from = vi.fn((table: string) => ({
    select(selected: string, options: { count: string; head: boolean }) {
      const filters: FilterCall[] = [];
      const query = {} as FakeBuilder;

      query.eq = (column, value) => {
        filters.push(eq(column, value));
        return query;
      };
      query.gte = (column, value) => {
        filters.push(gte(column, value));
        return query;
      };
      query.then = (onfulfilled, onrejected) => {
        const call = { table, selected, options, filters: [...filters] };
        calls.push(call);
        const key = keyOf(table, ...call.filters);
        const response = {
          count: counts[key] ?? 0,
          error: errorKey === key ? new Error("database denied") : null,
        };
        return Promise.resolve(response).then(onfulfilled, onrejected);
      };

      return query;
    },
  }));

  return { client: { from }, calls };
}

function eq(column: string, value: string | boolean): FilterCall {
  return { kind: "eq", column, value };
}

function gte(column: string, value: string): FilterCall {
  return { kind: "gte", column, value };
}

function keyOf(table: string, ...filters: FilterCall[]): string {
  return [
    table,
    ...filters.map((filter) =>
      [filter.kind, filter.column, String(filter.value)].join(":"),
    ),
  ].join("|");
}

function read(path: string): string {
  return readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
}
