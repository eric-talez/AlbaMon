// Explicitly opt-in: real disposable DB/Auth, real worker and signed route,
// local HTTP provider double. Never connects to a hosted email API.
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { runNotificationBatch } from "@/lib/notifications/worker";
import { POST } from "@/app/api/webhooks/email/route";

const run = test.skipIf(process.env.RUN_NOTIFICATION_LOCAL !== "true");
run("real concurrent claims, lost success recovery, durable signed webhook race and opted-out/deleted recipients", async () => {
  const config = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  if (config.API_URL !== "http://127.0.0.1:55321") throw new Error("Notification test requires owned local stack");
  const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const existing = await service.from("notification_outbox").select("id", { count: "exact", head: true });
  if (existing.error || existing.count !== 0) throw new Error("Notification integration needs an empty isolated queue; never claims unrelated fixtures");
  const users: string[] = [], jobIds = Array.from({ length: 10 }, () => randomUUID()), applicationIds = jobIds.map(() => randomUUID()), companyId = randomUUID();
  const email = `c1-${randomUUID()}@example.invalid`;
  const secret = Buffer.from("local-only-signing-double-with-32bytes").toString("base64");
  const deliveries = new Map<string, { body: string; id: string }>();
  const requests = new Map<string, number>();
  let mode: "success" | "retry" | "lost" | "bounce" = "success";
  let failCompletion = false;
  let earlyWebhookStatus = 0;
  let lastWebhook: () => Request;
  const webhook = (outboxId: string, providerId: string) => () => {
    const payload = JSON.stringify({ type: "email.bounced", created_at: "2020-01-01", data: { email_id: providerId, to: ["untrusted@example.invalid"], tags: { outbox_id: outboxId } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const id = `c1-${outboxId}`;
    const sig = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
    return new Request("http://localhost/api/webhooks/email", { method: "POST", headers: { "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${sig}` }, body: payload });
  };
  const provider = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const key = String(req.headers["idempotency-key"]);
      requests.set(key, (requests.get(key) ?? 0) + 1);
      if (mode === "retry") { res.writeHead(503, { "content-type": "application/json" }); res.end(JSON.stringify({ name: "internal_server_error", statusCode: 503, message: "provider fixture failure" })); return; }
      const prior = deliveries.get(key);
      if (prior && prior.body !== body) { res.writeHead(409, { "content-type": "application/json" }); res.end(JSON.stringify({ name: "invalid_idempotent_request", message: "changed payload" })); return; }
      const delivery = prior ?? { body, id: randomUUID() };
      deliveries.set(key, delivery);
      if (mode === "bounce") {
        lastWebhook = webhook(key, delivery.id);
        earlyWebhookStatus = (await POST(lastWebhook())).status;
      }
      if (mode === "lost") failCompletion = true;
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: delivery.id }));
    } catch { res.writeHead(500); res.end(); }
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const address = provider.address();
  if (!address || typeof address === "string") throw new Error("local double unavailable");
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://api.resend.com") return nativeFetch(`http://127.0.0.1:${address.port}${url.pathname}`, init);
    if (url.origin !== config.API_URL) throw new Error("External requests forbidden in notification integration");
    if (failCompletion && url.pathname.endsWith("/rpc/finish_notification_attempt")) return Promise.resolve(Response.json({ message: "local lost write" }, { status: 503 }));
    return nativeFetch(input, init);
  });
  for (const [key, value] of Object.entries({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: config.API_URL, SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL: "https://jobs.example.invalid", EMAIL_PROVIDER: "resend", EMAIL_NOTIFICATIONS_ENABLED: "true", EMAIL_ENVIRONMENT: "staging", EMAIL_STAGING_ALLOWLIST: email, EMAIL_FROM: "sender@example.invalid", RESEND_API_KEY: "re_local_double", RESEND_WEBHOOK_SECRET: `whsec_${secret}`, CRON_SECRET: "local-double-secret" })) vi.stubEnv(key, String(value));
  async function check(result: { error: unknown }) { if (result.error) throw new Error("Local notification fixture DB failure"); }
  try {
    const owner = await service.auth.admin.createUser({ email, email_confirm: true });
    if (owner.error || !owner.data.user) throw new Error("Local owner fixture failure");
    users.push(owner.data.user.id);
    const applicant = await service.auth.admin.createUser({ email: `c1-${randomUUID()}@example.invalid`, email_confirm: true });
    if (applicant.error || !applicant.data.user) throw new Error("Local applicant fixture failure");
    users.push(applicant.data.user.id);
    await check(await service.from("profiles").update({ role: "employer", email: "spoofed@example.invalid" }).eq("id", users[0]));
    await check(await service.from("companies").insert({ id: companyId, owner_id: users[0], name: "C1 local double", city: "Oakland" }));
    const template = await service.from("jobs").select("*").eq("id", "bbbbbbbb-0000-0000-0000-000000000001").single();
    await check(template);
    await check(await service.from("jobs").insert(jobIds.map(id => ({ ...template.data, id, company_id: companyId, expires_at: new Date(Date.now() + 86400000).toISOString() }))));
    await check(await service.from("applications").insert(applicationIds.map((id, index) => ({ id, job_id: jobIds[index], seeker_id: users[1], cover_note: "PRIVATE cover_note 555-1234 https://evil.test" }))));
    const locker = spawn("psql", [config.DB_URL, "-X", "-v", "ON_ERROR_STOP=1", "-At"], { stdio: ["pipe", "pipe", "pipe"] });
    const locked = new Promise<void>((resolve, reject) => {
      locker.stdout.on("data", chunk => { if (String(chunk).includes("C1_LOCKED")) resolve(); });
      locker.once("error", reject);
      locker.once("exit", () => reject(new Error("Local lock session exited early")));
    });
    locker.stdin.write(`begin; select id from public.notification_outbox where entity_id='${applicationIds[0]}' for update; select 'C1_LOCKED';\n`);
    try {
      await locked;
      const concurrent = await Promise.all([runNotificationBatch(), runNotificationBatch()]);
      expect(concurrent.map(result => result.sent).sort()).toEqual([4, 5]);
    } finally {
      const closed = once(locker, "exit");
      locker.stdin.end("rollback;\n");
      await closed;
    }
    expect((await runNotificationBatch()).sent).toBe(1);
    expect(deliveries.size).toBe(10);
    expect([...requests.values()]).toEqual(Array(10).fill(1));
    const payloads = [...deliveries.values()].map(delivery => JSON.parse(delivery.body));
    expect(payloads.every(payload => payload.to[0] === email)).toBe(true);
    expect(JSON.stringify(payloads)).not.toMatch(/PRIVATE|555-1234|evil\.test|spoofed/);

    // A provider failure cannot roll back the already-committed application.
    const one = (await service.from("notification_outbox").select("id").eq("entity_id", applicationIds[0]).single()).data!.id;
    await check(await service.from("notification_outbox").update({ status: "pending", available_at: new Date().toISOString() }).eq("id", one));
    mode = "retry";
    expect((await runNotificationBatch()).retry).toBe(1);
    expect((await service.from("applications").select("id").eq("id", applicationIds[0]).single()).data?.id).toBe(applicationIds[0]);
    // A successful provider response followed by a failed DB write recovers with
    // exactly the same ID/payload, acknowledged once by the idempotent double.
    await check(await service.from("notification_outbox").update({ available_at: new Date().toISOString() }).eq("id", one));
    mode = "lost";
    await expect(runNotificationBatch()).rejects.toThrow("notification_database_unavailable");
    expect((await service.from("notification_outbox").select("status").eq("id", one).single()).data?.status).toBe("sending");
    failCompletion = false;
    await check(await service.from("notification_outbox").update({ lease_until: new Date(0).toISOString() }).eq("id", one));
    mode = "success";
    expect((await runNotificationBatch()).sent).toBe(1);
    expect(deliveries.size).toBe(10);

    // Fresh event: signed bounce races ahead of the worker's provider-id write.
    await check(await service.from("messages").insert({ application_id: applicationIds[0], sender_id: users[1], body: "PRIVATE message URL https://evil.test" }));
    mode = "bounce";
    expect((await runNotificationBatch()).sent).toBe(0);
    expect(earlyWebhookStatus).toBe(200);
    expect((await service.from("profiles").select("suppressed_email").eq("id", users[0]).single()).data?.suppressed_email).toBe(true);
    expect((await POST(lastWebhook!())).status).toBe(200);
    const receipts = await service.from("email_webhook_receipts").select("event_id", { count: "exact" });
    expect(receipts.count).toBe(1);
    const suppressed = await service.from("notification_outbox").select("status,provider_id").eq("kind", "message_digest").eq("entity_id", applicationIds[0]).single();
    expect(suppressed.data?.status).toBe("suppressed");
    expect(suppressed.data?.provider_id).toBeTruthy();
    const before = deliveries.size;
    mode = "success";
    await check(await service.from("messages").insert({ application_id: applicationIds[1], sender_id: users[1], body: "next" }));
    expect((await runNotificationBatch()).suppressed).toBe(1);
    expect(deliveries.size).toBe(before);
    await check(await service.from("profiles").update({ suppressed_email: false, email_notifications_enabled: false }).eq("id", users[0]));
    await check(await service.from("messages").insert({ application_id: applicationIds[2], sender_id: users[1], body: "opt out" }));
    expect((await runNotificationBatch()).suppressed).toBe(1);
    expect(deliveries.size).toBe(before);
    await check(await service.from("messages").insert({ application_id: applicationIds[3], sender_id: users[0], body: "deleted recipient" }));
    await check(await service.auth.admin.deleteUser(users[1]));
    expect((await runNotificationBatch()).sent).toBe(0);
    expect(deliveries.size).toBe(before);
  } finally {
    failCompletion = false;
    const notifications = await service.from("notification_outbox").delete().in("entity_id", [...jobIds, ...applicationIds]);
    const audit = await service.from("audit_logs").delete().in("entity_id", [...jobIds, ...applicationIds]);
    const company = await service.from("companies").delete().eq("id", companyId);
    for (const id of users) await service.auth.admin.deleteUser(id);
    const remaining = await service.from("notification_outbox").select("id", { count: "exact", head: true }).in("entity_id", [...jobIds, ...applicationIds]);
    const receipts = await service.from("email_webhook_receipts").select("event_id", { count: "exact", head: true }).like("event_id", "c1-%");
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await new Promise<void>(resolve => provider.close(() => resolve()));
    expect([notifications.error, audit.error, company.error, remaining.error, receipts.error]).toEqual([null, null, null, null, null]);
    expect(remaining.count).toBe(0);
    expect(receipts.count).toBe(0);
  }
}, 60_000);
