import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";

// Disposable local Auth integration, never provider OAuth proof. Credentials,
// factors, QR material and codes remain in process/browser memory. No traces.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function adminClient() {
  if (url !== "http://127.0.0.1:55321") throw new Error("Local Auth tests require isolated Supabase");
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  return createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function signIn(context: BrowserContext, email: string, password: string, expired = false) {
  const cookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient(url, anonKey, { cookies: {
    getAll: () => [...cookies.values()],
    setAll: (items) => { for (const item of items) cookies.set(item.name, item); },
  } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("Disposable local sign-in failed");
  if (expired) {
    // Make the persisted session due for refresh; the real refresh token is used.
    const session = { ...data.session, expires_at: 1 };
    cookies.clear();
    cookies.set("sb-127-auth-token", { name: "sb-127-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, options: {} });
  }
  await context.clearCookies();
  await context.addCookies([...cookies.values()].map(({ name, value }) => ({ name, value, domain: "127.0.0.1", path: "/", sameSite: "Lax" })));
}
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

test("local admin enrolls TOTP, retries a bad code, and steps up again after sign-in", async ({ page, context }) => {
  test.setTimeout(60_000);
  const admin = adminClient();
  const email = `mfa-${randomBytes(10).toString("hex")}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Disposable admin setup failed");
  try {
    const role = await admin.from("profiles").update({ role: "admin", display_name: "Local MFA test" }).eq("id", data.user.id);
    if (role.error) throw new Error("Disposable admin role setup failed");
    await signIn(context, email, password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\/security$/);
    await page.getByRole("button", { name: "인증 시작 / Start verification" }).click();
    await expect(page.getByAltText("인증 앱 등록 QR / Authenticator setup QR")).toBeVisible();
    // Leaving before verification must permit a clean new enrollment.
    await page.reload();
    await page.getByRole("button", { name: "인증 시작 / Start verification" }).click();
    await expect(page.getByAltText("인증 앱 등록 QR / Authenticator setup QR")).toBeVisible();
    const secret = await page.locator("[data-totp-secret]").textContent();
    if (!secret) throw new Error("Enrollment material unavailable");
    const input = page.getByLabel("인증번호 / Verification code");
    // A deliberately invalid shape is rejected locally, without exposing a code.
    await input.fill("123");
    await page.getByRole("button", { name: "인증 확인 / Verify" }).click();
    await expect(page).toHaveURL(/\/account\/security$/);
    await input.fill(((Number(totp(secret)) + 1) % 1000000).toString().padStart(6, "0"));
    await page.getByRole("button", { name: "인증 확인 / Verify" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Verification failed" })).toContainText("Verification failed");
    await input.fill(totp(secret));
    await page.getByRole("button", { name: "인증 확인 / Verify" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("button", { name: /로그아웃/ }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
    await signIn(context, email, password);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account\/security$/);
    await page.getByRole("button", { name: "인증 시작 / Start verification" }).click();
    await expect(page.locator("[data-totp-secret]")).toHaveCount(0);
    // Auth prevents TOTP replay within the same time step.
    const wait = 30000 - Date.now() % 30000 + 1000;
    await new Promise((resolve) => setTimeout(resolve, wait));
    await page.getByLabel("인증번호 / Verification code").fill(totp(secret));
    await page.getByRole("button", { name: "인증 확인 / Verify" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  } finally {
    await page.goto("about:blank"); // Prevent failure artifacts from retaining enrollment material.
    expect((await admin.from("audit_logs").delete().eq("entity_id",data.user.id)).error).toBeNull();
    const result = await admin.auth.admin.deleteUser(data.user.id);
    if (result.error) throw new Error("Disposable admin cleanup failed");
  }
});

test("local profile save returns to apply, preserves identity, and refreshes an expired session", async ({ page, context }) => {
  const admin = adminClient();
  const password = randomBytes(32).toString("base64url");
  const users: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `profile-${randomBytes(10).toString("hex")}@example.invalid`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error("Disposable seeker setup failed");
      users.push(data.user.id);
      await signIn(context, email, password, index === 1);
      const beforeRefresh = await context.cookies();
      const destination = "/jobs/bbbbbbbb-0000-0000-0000-000000000001/apply";
      await page.goto(`/dashboard/profile?next=${encodeURIComponent(destination)}`);
      await expect(page.getByRole("heading", { name: "프로필 / Profile" })).toBeVisible();
      if (index === 1) {
        const afterRefresh = await context.cookies();
        // Compare as a boolean so test failures never print session material.
        expect(afterRefresh.some((cookie) => cookie.name === "sb-127-auth-token" &&
          cookie.value !== beforeRefresh.find((item) => item.name === cookie.name)?.value)).toBe(true);
      }
      await page.getByLabel("표시 이름 / Display name").fill("Same display name");
      await page.getByLabel("도시 (선택) / City (optional)").fill("Los Angeles");
      await page.getByLabel("이메일 알림 / Email notifications").selectOption("false");
      await page.locator('[name="agreeTerms"]').check();
      await page.locator('[name="confirmPrivacyNotice"]').check();
      await page.getByRole("button", { name: "저장하고 계속 / Save and continue" }).click();
      await expect(page).toHaveURL(new RegExp(`${destination}$`));
      const profile = await admin.from("profiles").select("display_name, role, city, email_notifications_enabled").eq("id", data.user.id).single();
      expect(profile.data).toEqual({ display_name: "Same display name", role: "seeker", city: "Los Angeles", email_notifications_enabled: false });
    }
    expect(new Set(users).size).toBe(2);
    await page.goto("/dashboard/profile?next=//evil.example");
    await page.getByRole("button", { name: "저장하고 계속 / Save and continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await page.goto("about:blank");
    for (const id of users) {
      expect((await admin.from("audit_logs").delete().eq("entity_id",id)).error).toBeNull();
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) throw new Error("Disposable seeker cleanup failed");
    }
  }
});

test("invalid and canceled local callbacks return privately to login", async ({ request }) => {
  for (const suffix of ["?code=invalid", "?error=access_denied", ""]) {
    const response = await request.get(`/auth/callback${suffix}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toMatch(/\/login(?:\?error=auth_callback)?$/);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["cache-control"]).toContain("private");
  }
});


test("local PKCE callback exchanges a real code and sends an incomplete profile to onboarding", async ({ page, context }) => {
  const admin = adminClient();
  const email = `callback-${randomBytes(10).toString("hex")}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Disposable callback user setup failed");
  const mailSearch = `http://127.0.0.1:55324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  try {
    const cookieJar = new Map<string, string>();
    const client = createServerClient(url, anonKey, { cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (items) => { for (const item of items) cookieJar.set(item.name, item.value); },
    } });
    const destination = "/jobs/bbbbbbbb-0000-0000-0000-000000000001/apply";
    const sent = await client.auth.signInWithOtp({ email, options: {
      shouldCreateUser: false, emailRedirectTo: `http://127.0.0.1:3100/auth/callback?next=${encodeURIComponent(destination)}`,
    } });
    if (sent.error) throw new Error("Local PKCE email request failed");
    let messageId: string | undefined;
    for (let attempt = 0; attempt < 20 && !messageId; attempt++) {
      const inbox = await (await fetch(mailSearch)).json();
      messageId = inbox.messages[0]?.ID;
      if (!messageId) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!messageId) throw new Error("Local PKCE message did not arrive");
    const message = await (await fetch(`http://127.0.0.1:55324/api/v1/message/${messageId}`)).json();
    const link = message.HTML.match(/href="([^\"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    if (!link || new URL(link).origin !== url) throw new Error("Local PKCE verification link unavailable");
    // Native fetch keeps one-use tokens out of Playwright call logs and artifacts.
    const verified = await fetch(link, { redirect: "manual" });
    const callback = verified.headers.get("location");
    if (!callback || !callback.startsWith("http://127.0.0.1:3100/auth/callback?") || !new URL(callback).searchParams.has("code")) {
      throw new Error("Local verification did not produce a PKCE callback");
    }
    const exchanged = await fetch(callback, { redirect: "manual", headers: {
      Cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
    } });
    expect(exchanged.status).toBe(307);
    expect(exchanged.headers.get("cache-control")).toContain("no-store");
    const location = new URL(exchanged.headers.get("location")!, callback);
    expect(location.origin).toBe("http://127.0.0.1:3100");
    expect(location.pathname).toBe("/dashboard/profile");
    expect(location.searchParams.get("next")).toBe(destination);
    const sessionCookies = exchanged.headers.getSetCookie().map((cookie) => {
      const pair = cookie.split(";")[0];
      const split = pair.indexOf("=");
      return { name: pair.slice(0, split), value: pair.slice(split + 1), domain: "127.0.0.1", path: "/" };
    });
    await context.addCookies(sessionCookies);
    await page.goto(location.href);
    await expect(page.getByRole("heading", { name: "프로필 / Profile" })).toBeVisible();
    await page.getByLabel("표시 이름 / Display name").fill("Callback test");
    await page.locator('[name="agreeTerms"]').check();
    await page.locator('[name="confirmPrivacyNotice"]').check();
    await page.getByRole("button", { name: "저장하고 계속 / Save and continue" }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  } finally {
    await page.goto("about:blank");
    const mailCleanup = await fetch(mailSearch, { method: "DELETE" });
    expect((await admin.from("audit_logs").delete().eq("entity_id",data.user.id)).error).toBeNull();
    const userCleanup = await admin.auth.admin.deleteUser(data.user.id);
    if (!mailCleanup.ok || userCleanup.error) throw new Error("Disposable callback cleanup failed");
  }
});
