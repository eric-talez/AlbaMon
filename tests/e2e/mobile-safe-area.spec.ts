import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

test("injected 34px safe area keeps mobile action controls above navigation", async ({ page }) => {
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Owned local stack only");
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const id = randomUUID();
  const template = await service.from("jobs").select("*").eq("id", "bbbbbbbb-0000-0000-0000-000000000001").single();
  expect(template.error).toBeNull();
  try {
    expect((await service.from("jobs").insert({ ...template.data, id, boost: null, expires_at: new Date(Date.now() + 86400000).toISOString() })).error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    // Chromium environment injection tests layout geometry, not physical iOS.
    await page.goto(`/jobs/${id}`);
    await page.evaluate(() => {
      const inject = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSStyleRule) rule.style.cssText = rule.style.cssText.replaceAll("env(safe-area-inset-bottom)", "34px");
          if ("cssRules" in rule) inject((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) inject(sheet.cssRules);
    });
    const nav = page.getByRole("navigation", { name: "모바일 메뉴" });
    expect(await nav.evaluate(el => getComputedStyle(el).paddingBottom)).toBe("34px");
    const apply = page.getByRole("link", { name: "지원하기 (Apply)", exact: true });
    await apply.scrollIntoViewIfNeeded();
    const report = page.getByRole("link", { name: "Report this job / 신고하기", exact: true });
    await report.scrollIntoViewIfNeeded();
    const actionBox = await report.boundingBox(), navBox = await nav.boundingBox();
    console.log(JSON.stringify({ inset: 34, actionBottom: actionBox!.y + actionBox!.height, navTop: navBox!.y }));
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(navBox!.y);
  } finally {
    expect((await service.from("audit_logs").delete().eq("entity_id", id)).error).toBeNull();
    expect((await service.from("notification_outbox").delete().eq("entity_id", id)).error).toBeNull();
    expect((await service.from("jobs").delete().eq("id", id)).error).toBeNull();
  }
});
