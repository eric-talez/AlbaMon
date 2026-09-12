import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/webhooks/email/route";
import { GET } from "@/app/api/internal/notifications/route";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn(), worker: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceRoleClient: mocks.client }));
vi.mock("@/lib/notifications/worker", () => ({ runNotificationBatch: mocks.worker }));
const secret = Buffer.from("local-only-signing-double-with-32bytes").toString("base64");
const outboxId = "c1000000-0000-4000-8000-000000000001";
function request({ type = "email.bounced", timestamp = Math.floor(Date.now() / 1000), signature = "", tag = outboxId, payloadChange = false } = {}) {
  const payload = JSON.stringify({ type, created_at: "2020-01-01", data: { email_id: "provider-1", to: ["forged-private@example.invalid"], tags: { outbox_id: tag }, bounce: { message: "private failure text" } } });
  const digest = createHmac("sha256", Buffer.from(secret, "base64")).update(`evt-1.${timestamp}.${payload}`).digest("base64");
  return new Request("http://localhost/api/webhooks/email", { method: "POST", headers: { "svix-id": "evt-1", "svix-timestamp": String(timestamp), "svix-signature": signature || `v1,${digest}` }, body: payloadChange ? payload + " " : payload });
}
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_double");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${secret}`);
  vi.stubEnv("CRON_SECRET", "local-cron-double");
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.client.mockReset().mockReturnValue({ rpc: mocks.rpc });
  mocks.worker.mockReset().mockResolvedValue({ sent: 1, retry: 0, failed: 0, suppressed: 0 });
});
afterEach(() => vi.unstubAllEnvs());
test.each([{ signature: "v1,invalid" }, { payloadChange: true }, { timestamp: 1 }, { timestamp: Math.floor(Date.now() / 1000) + 600 }])("rejects invalid/tampered/expired signature before constructing trusted client", async (options) => {
  expect((await POST(request(options))).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
});
test("missing signature headers fails closed", async () => {
  expect((await POST(new Request("http://localhost/api/webhooks/email", { method: "POST", body: "{}" }))).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
});
test.each(["email.bounced", "email.complained"])("signed %s correlates only provider id and validated outbox tag; old event time is replayable", async (type) => {
  expect((await POST(request({ type }))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("record_email_webhook", { p_event_id: "evt-1", p_kind: type, p_provider_id: "provider-1", p_outbox_id: outboxId });
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("private");
});
test("signed duplicate is acknowledged only after durable DB helper succeeds", async () => {
  expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
test.each([{ data: false, error: null }, { data: null, error: { message: "secret DB detail" } }])("valid event with missing correlation or DB failure stays retryable", async (result) => {
  mocks.rpc.mockResolvedValue(result);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
test("invalid tag cannot become a DB identifier", async () => {
  expect((await POST(request({ tag: "not-a-uuid" }))).status).toBe(200);
  expect(mocks.rpc.mock.calls[0][1].p_outbox_id).toBeNull();
});
test("verified unrelated type is acknowledged without DB write", async () => {
  expect((await POST(request({ type: "email.delivered" }))).status).toBe(200);
  expect(mocks.client).not.toHaveBeenCalled();
});
test("missing provider configuration is safe runtime failure", async () => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  expect(mocks.client).not.toHaveBeenCalled();
});
test.each([undefined, "Bearer wrong", "local-cron-double"])("cron rejects %s before any trusted work", async (authorization) => {
  const response = await GET(new Request("http://localhost/api/internal/notifications", { headers: authorization ? { authorization } : {} }));
  expect(response.status).toBe(401);
  expect(mocks.worker).not.toHaveBeenCalled();
});
test("absent cron secret never matches an empty bearer", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("http://localhost/api/internal/notifications", { headers: { authorization: "Bearer " } }))).status).toBe(401);
});
test("authorized cron invokes bounded worker and errors safely", async () => {
  const req = () => new Request("http://localhost/api/internal/notifications", { headers: { authorization: "Bearer local-cron-double" } });
  expect(await (await GET(req())).json()).toEqual({ sent: 1, retry: 0, failed: 0, suppressed: 0 });
  mocks.worker.mockRejectedValue(new Error("secret detail"));
  const failed = await GET(req());
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("secret detail");
});
