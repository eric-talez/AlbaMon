import { test, expect, APPROVED_JOB } from "./helpers";

/**
 * Scenario 1 — public shell renders and hydrates cleanly on both viewports,
 * with the work-authorization/compliance copy visible. The `noBrowserErrors`
 * auto fixture (helpers.ts) fails any test that emits an uncaught page error,
 * a hydration error, or an unexpected console error.
 */
test.describe("public shell", () => {
  test("home renders brand, jobs CTA, and work-authorization copy", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "K-Work US" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "공고 둘러보기" }),
    ).toBeVisible();
    await expect(
      page.getByText(/취업 자격\(work authorization\)을 판단하지 않습니다/),
    ).toBeVisible();
  });

  test("jobs list renders approved mock jobs and the filter form", async ({
    page,
  }) => {
    await page.goto("/jobs");
    await expect(
      page.getByRole("heading", { level: 1, name: "공고 둘러보기" }),
    ).toBeVisible();
    await expect(page.getByText(/검증된 공고 \d+개/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: APPROVED_JOB.titleFragment }),
    ).toBeVisible();
    await expect(page.getByRole("form", { name: "공고 필터" })).toBeVisible();
  });

  test("approved job detail renders disclaimer + apply/report actions", async ({
    page,
  }) => {
    await page.goto(`/jobs/${APPROVED_JOB.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: APPROVED_JOB.title }),
    ).toBeVisible();
    // Reusable work-authorization disclaimer (role=note, aria-label).
    await expect(
      page.getByRole("note", { name: "근로 자격 안내" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "지원하기 (Apply)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Report this job / 신고하기" }),
    ).toBeVisible();
  });

  test("home → jobs → detail navigation works through the UI", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "공고 둘러보기" }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await page
      .getByRole("link", { name: APPROVED_JOB.titleFragment })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${APPROVED_JOB.id}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: APPROVED_JOB.title }),
    ).toBeVisible();
  });
});

/**
 * A non-approved/unknown job id must 404. Navigating to a 404 logs an expected
 * "resource 404" console message, so this test narrowly allows only that one
 * pattern (via allowConsoleErrors) — the external-network guard still applies,
 * and every other console/page error still fails the test.
 */
test.describe("expected 404", () => {
  test.use({ allowConsoleErrors: [/Failed to load resource.*404/i] });

  test("unknown job id returns 404", async ({ page }) => {
    const response = await page.goto("/jobs/kw-does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
