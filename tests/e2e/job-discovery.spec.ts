import { test, expect, IRVINE_JOB } from "./helpers";

/**
 * Scenario 2 — job discovery filters through the real (native GET) UI. The
 * filter form submits a full server round-trip, so URL query state is the
 * source of truth. Matching, empty, and reset states are all exercised.
 */
test.describe("job discovery filters", () => {
  test("city filter narrows results and preserves URL query state", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const form = page.getByRole("form", { name: "공고 필터" });
    await form.getByLabel("지역 (City)").selectOption(IRVINE_JOB.city);
    await form.getByRole("button", { name: "검색 (Search)" }).click();

    await page.waitForURL(/\/jobs\?/);
    expect(new URL(page.url()).searchParams.get("city")).toBe(IRVINE_JOB.city);
    await expect(page.getByText(/검색 결과 1개/)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: IRVINE_JOB.title }),
    ).toBeVisible();
  });

  test("keyword filter matches, preserving q in the URL", async ({ page }) => {
    await page.goto("/jobs");
    const form = page.getByRole("form", { name: "공고 필터" });
    await form.getByLabel("검색어 (Keyword)").fill("바리스타");
    await form.getByRole("button", { name: "검색 (Search)" }).click();

    await page.waitForURL(/\/jobs\?/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("바리스타");
    await expect(
      page.getByRole("heading", { level: 3, name: /바리스타/ }),
    ).toBeVisible();
  });

  test("a non-matching keyword shows the empty state", async ({ page }) => {
    await page.goto("/jobs?q=존재하지않는키워드zzz");
    await expect(
      page.getByText("조건에 맞는 공고가 없습니다."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0);
  });

  test("Reset clears filters and restores all results", async ({ page }) => {
    await page.goto("/jobs?city=Irvine");
    await expect(page.getByText(/검색 결과 1개/)).toBeVisible();

    // Reset is a link inside the filter form → back to unfiltered /jobs.
    await page
      .getByRole("form", { name: "공고 필터" })
      .getByRole("link", { name: "필터 초기화 / Reset" })
      .click();

    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByText(/검증된 공고 \d+개/)).toBeVisible();
  });
});
