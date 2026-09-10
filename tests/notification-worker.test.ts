import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emailDeliveryConfigured, notificationText, sendNotificationEmail } from "@/lib/notifications/email";
import { runNotificationBatch } from "@/lib/notifications/worker";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: () => { mocks.client(); return { rpc: mocks.rpc, auth: { admin: { getUserById: mocks.user } } }; } }));
const id = "c1000000-0000-4000-8000-000000000001";
const row = { id, recipient_id: "recipient", attempts: 1, first_attempt_at: new Date().toISOString() };
let providerPayload: Record<string, unknown>;
let providerHeaders: Headers;
let providerCalls: number;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("EMAIL_NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("EMAIL_ENVIRONMENT", "staging");
  vi.stubEnv("EMAIL_STAGING_ALLOWLIST", "controlled@example.invalid");
  vi.stubEnv("EMAIL_FROM", "K-Work US <sender@example.invalid>");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://jobs.example.invalid");
  vi.stubEnv("RESEND_API_KEY", "re_local_double");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "local_double");
  vi.stubEnv("CRON_SECRET", "local-test-secret-not-a-real-credential");
  providerCalls = 0;
  mocks.client.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    providerCalls++;
    providerPayload = JSON.parse(init.body);
    providerHeaders = new Headers(init.headers);
    return Response.json({ id: "provider-1" });
  }));
  mocks.user.mockReset().mockResolvedValue({ data: { user: { email: "controlled@example.invalid", email_confirmed_at: "2026-01-01" } }, error: null });
  mocks.rpc.mockReset().mockImplementation(async (name) => {
    if (name === "claim_notification_batch") return { data: [row], error: null };
    if (name === "get_notification_delivery_context") return { data: [{ account_status: "active", email_notifications_enabled: true, suppressed_email: false, path: "/dashboard/applications" }], error: null };
    return { data: true, error: null };
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test("fixed notification text only accepts approved internal routes", () => {
  expect(notificationText("/dashboard/applications")).toContain("https://jobs.example.invalid/dashboard/applications");
  expect(notificationText("/dashboard/applications")).toContain("새 알림이 있습니다. 로그인 후 확인해 주세요.");
  for (const path of ["https://evil.test", "//evil.test", "/admin?secret=x", "/dashboard/applications#x", "/dashboard/applications/../profile"]) {
    expect(() => notificationText(path)).toThrow();
  }
});
test("provider payload is fixed, single-recipient, tagged and idempotent with no application/message/contact content", async () => {
  const input = { eventId: id, to: "controlled@example.invalid", path: "/dashboard/applications", cover_note: "private application text", body: "private message https://evil.test", phone: "555-private" };
  expect(await sendNotificationEmail(input)).toEqual({ providerId: "provider-1" });
  const payload = JSON.stringify(providerPayload);
  for (const secret of [input.cover_note, input.body, input.phone, "cover_note"]) expect(payload).not.toContain(secret);
  expect(providerPayload).toMatchObject({ to: [input.to], tags: [{ name: "outbox_id", value: id }] });
  expect(providerHeaders.get("idempotency-key")).toBe(id);
});
test.each(["", "other@example.invalid", "*@example.invalid", "controlled@example.invalid.evil"])('staging fails closed for allowlist %s', async (allowlist) => {
  vi.stubEnv("EMAIL_STAGING_ALLOWLIST", allowlist);
  await expect(sendNotificationEmail({ eventId: id, to: "controlled@example.invalid", path: "/dashboard/applications" })).rejects.toMatchObject({ code: expect.stringMatching(/staging|configuration/), retryable: false });
  expect(providerCalls).toBe(0);
});
test.each([429, 500, 503])("provider %s schedules retry without leaking provider text", async (status) => {
  vi.stubGlobal("fetch", async () => Response.json({ name: "rate_limit_exceeded", statusCode: status, message: "secret provider detail" }, { status, headers: { "retry-after": "600" } }));
  expect(await runNotificationBatch()).toEqual({ sent: 0, retry: 1, failed: 0, suppressed: 0 });
  const finish = mocks.rpc.mock.calls.find(c => c[0] === "finish_notification_attempt");
  expect(finish?.[1]).toMatchObject({ p_id: id, p_attempts: 1, p_status: "pending", p_retry_after_seconds: 600 });
  expect(JSON.stringify(finish)).not.toContain("secret provider detail");
});
test("pinned SDK really aborts provider fetch at ten seconds", async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => timeout(ms === 10_000 ? 20 : ms));
  let aborted = false;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { aborted = true; reject(init.signal?.reason); });
  }));
  expect(await runNotificationBatch()).toEqual({ sent: 0, retry: 1, failed: 0, suppressed: 0 });
  expect(aborted).toBe(true);
  expect(mocks.rpc.mock.calls.find(c => c[0] === "finish_notification_attempt")?.[1].p_error_code).toBe("provider_timeout");
});
test.each(["unconfirmed", "deleted", "suspended", "opted_out", "bounced"])("%s recipient is suppressed without provider send", async (condition) => {
  if (condition === "unconfirmed") mocks.user.mockResolvedValue({ data: { user: { email: "controlled@example.invalid" } }, error: null });
  if (condition === "deleted") mocks.user.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
  if (["suspended", "opted_out", "bounced"].includes(condition)) mocks.rpc.mockImplementation(async (name) => ({ data: name === "claim_notification_batch" ? [row] : name === "get_notification_delivery_context" ? [{ account_status: condition === "suspended" ? "suspended" : "active", email_notifications_enabled: condition !== "opted_out", suppressed_email: condition === "bounced", path: "/dashboard/applications" }] : true, error: null }));
  expect((await runNotificationBatch()).suppressed).toBe(1);
  expect(providerCalls).toBe(0);
});
test("Auth transient failure retries rather than treating a recipient as unverified", async () => {
  mocks.user.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  expect((await runNotificationBatch()).retry).toBe(1);
  expect(providerCalls).toBe(0);
});
test("successful provider delivery with failed DB completion retains lease for idempotent recovery", async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "finish_notification_attempt" ? { data: null, error: { code: "local_error" } } : original(name, args));
  await expect(runNotificationBatch()).rejects.toThrow("notification_database_unavailable");
  expect(providerHeaders.get("idempotency-key")).toBe(id);
});
test("lost claim or webhook suppression cannot be overwritten or counted as sent", async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "finish_notification_attempt" ? { data: false, error: null } : original(name, args));
  expect((await runNotificationBatch()).sent).toBe(0);
});
test("changed deterministic payload fails before a second provider send", async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "bind_notification_payload" ? { data: false, error: null } : original(name, args));
  expect((await runNotificationBatch()).failed).toBe(1);
  expect(providerCalls).toBe(0);
});
test("unknown success older than 23 hours is never sent again", async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "claim_notification_batch" ? { data: [{ ...row, first_attempt_at: "2020-01-01" }], error: null } : original(name, args));
  expect((await runNotificationBatch()).failed).toBe(1);
  expect(providerCalls).toBe(0);
});
test.each([
  [409, "concurrent_idempotent_requests", "retry"],
  [409, "invalid_idempotent_request", "failed"],
  [401, "validation_error", "failed"],
])("provider %s %s has explicit retry policy", async (status, name, expected) => {
  vi.stubGlobal("fetch", async () => Response.json({ name, statusCode: Number(status), message: "private" }, { status: Number(status) }));
  expect((await runNotificationBatch())[expected as "retry" | "failed"]).toBe(1);
});
test("fifth retryable provider failure is counted as failed", async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === "claim_notification_batch" ? { data: [{ ...row, attempts: 5 }], error: null } : original(name, args));
  vi.stubGlobal("fetch", async () => Response.json({ name: "internal_server_error", statusCode: 500, message: "private" }, { status: 500 }));
  expect(await runNotificationBatch()).toEqual({ sent: 0, retry: 0, failed: 1, suppressed: 0 });
});
test("deadline leaves unstarted claims leased instead of starting work near function kill", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name === "claim_notification_batch") return { data: [row, { ...row, id: "second" }], error: null };
    if (name === "finish_notification_attempt") now += 80_000;
    return original(name, args);
  });
  expect((await runNotificationBatch()).sent).toBe(1);
  expect(providerCalls).toBe(1);
});
test("mixed malformed staging allowlist never enables delivery", async () => {
  vi.stubEnv("EMAIL_STAGING_ALLOWLIST", "controlled@example.invalid,*@example.invalid");
  await expect(sendNotificationEmail({ eventId: id, to: "controlled@example.invalid", path: "/dashboard/applications" })).rejects.toMatchObject({ code: "email_configuration" });
  expect(providerCalls).toBe(0);
});

test.each(["development", "test"])("%s runtime refuses sends and worker clients before SDK private diagnostics", async (runtime) => {
  vi.stubEnv("NODE_ENV", runtime);
  const diagnostics: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => { diagnostics.push(args); });
  vi.stubGlobal("fetch", async () => {
    providerCalls++;
    return Response.json({ name: "validation_error", statusCode: 400, message: "PRIVATE fixture recipient@example.invalid" }, { status: 400 });
  });
  const sendError = await sendNotificationEmail({ eventId: id, to: "controlled@example.invalid", path: "/dashboard/applications" }).catch(error => error);
  const workerError = await runNotificationBatch().catch(error => error);
  expect({ configured: emailDeliveryConfigured(), sendCode: sendError.code, workerCode: workerError.message,
    providerCalls, clientCalls: mocks.client.mock.calls.length, diagnostics: diagnostics.length }).toEqual({
    configured: false, sendCode: "email_configuration", workerCode: "email_configuration", providerCalls: 0, clientCalls: 0, diagnostics: 0,
  });
});
