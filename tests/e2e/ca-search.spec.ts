import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const fixtureIds = Array.from(
  { length: 21 },
  (_, index) => `e0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

test.describe.configure({ mode: "serial" });

function adminClient() {
  if (url !== "http://127.0.0.1:55321") {
    throw new Error("California search tests require isolated Supabase");
  }
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  return createClient(url, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.beforeAll(async () => {
  const rows = fixtureIds.map((id, index) => ({
    id,
    company_id: "aaaaaaaa-0000-0000-0000-000000000003",
    title: `E2E CA page fixture ${index + 1}`,
    category: "other",
    job_type: "part_time",
    city: "Oakland",
    state: "CA",
    address_display: "Oakland, CA",
    address_display_mode: "city_only",
    pay_min: 20,
    pay_max: 20,
    pay_unit: "hour",
    tips_available: false,
    schedule_days: "월–금",
    schedule_time_range: "9:00 AM – 5:00 PM",
    language_requirement: "english_required",
    description: "Pagination fixture",
    responsibilities: [],
    requirements: [],
    benefits: [],
    moderation_status: "approved",
    posted_at: "2026-09-09T12:00:00Z",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }));
  const { error } = await adminClient().from("jobs").upsert(rows);
  if (error) throw new Error("Disposable pagination setup failed");
});

test.afterAll(async () => {
  const { error } = await adminClient().from("jobs").delete().in("id", fixtureIds);
  if (error) throw new Error("Disposable pagination cleanup failed");
});

test("California cities, literal keywords, and zero results use the real public RPC", async ({ page }) => {
  await page.goto("/jobs");
  await page.waitForLoadState("networkidle");
  const city = page.getByLabel("지역 (City)");
  await expect(city.getByRole("option", { name: "San Jose" })).toHaveCount(1);
  await expect(city.getByRole("option", { name: "Sacramento" })).toHaveCount(1);
  await expect(city.getByRole("option", { name: "San Diego" })).toHaveCount(1);

  for (const query of ["*", ",", "open(", "close)", "%", "_"]) {
    await page.goto(`/jobs?q=${encodeURIComponent(query)}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('a[href="/jobs/bbbbbbbb-0000-0000-0000-000000000011"]')).toBeVisible();
  }

  await page.goto("/jobs?q=no-such-california-job");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("조건에 맞는 공고가 없습니다.")).toBeVisible();
});

test("plain GET filters keep one pay unit and reset pagination without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/jobs?page=2");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("검색어 (Keyword)").fill("급여 의미 테스트");
    await page.getByLabel("급여 단위 (Pay unit)").selectOption("hour");
    await page.getByLabel("최소 급여 (Min pay)").fill("20");
    await page.getByRole("button", { name: "검색 (Search)" }).click();
    await expect(page).toHaveURL((current) =>
      current.pathname === "/jobs" &&
      current.searchParams.get("payUnit") === "hour" &&
      current.searchParams.get("payMin") === "20" &&
      current.searchParams.get("page") === null,
    );
    await expect(page.locator('a[href="/jobs/bbbbbbbb-0000-0000-0000-000000000012"]')).toBeVisible();
    await expect(page.locator('a[href="/jobs/bbbbbbbb-0000-0000-0000-000000000011"]')).toHaveCount(0);
    await expect(page.locator('a[href="/jobs/bbbbbbbb-0000-0000-0000-000000000013"]')).toHaveCount(0);
    await expect(page.getByText("시급 $22–$25")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("twenty-one same-time rows paginate with a stable id tie-break", async ({ page }) => {
  await page.goto(`/jobs?q=${encodeURIComponent("E2E CA page fixture")}`);
  await page.waitForLoadState("networkidle");
  const cards = page.locator('a[href^="/jobs/e0000000-"]');
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toHaveAttribute("href", `/jobs/${fixtureIds[20]}`);
  const next = page.getByRole("link", { name: "다음 페이지 →" });
  const nextUrl = new URL((await next.getAttribute("href"))!, "http://127.0.0.1:3100");
  expect(nextUrl.searchParams.get("q")).toBe("E2E CA page fixture");
  expect(nextUrl.searchParams.get("page")).toBe("2");
  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator('a[href^="/jobs/e0000000-"]')).toHaveCount(1);
  await expect(page.locator(`a[href="/jobs/${fixtureIds[0]}"]`)).toBeVisible();
  await expect(page.getByRole("link", { name: "← 이전 페이지" })).toBeVisible();
});
