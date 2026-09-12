import { test, expect } from "./helpers";

/**
 * Scenario 4 — responsive navigation. The desktop header nav and the mobile
 * bottom nav are the two nameless, viewport-swapped landmarks (each carries a
 * `data-testid`, the one place a semantic selector is genuinely ambiguous).
 * This spec runs under both the desktop and 390px-mobile projects; each asserts
 * the nav appropriate to its viewport, plus a no-horizontal-overflow check.
 */
test.describe("responsive navigation", () => {
  test("the correct nav shows for the viewport", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === "chromium-mobile";
    await page.goto("/");

    if (isMobile) {
      await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
      await expect(page.getByTestId("desktop-nav")).toBeHidden();
      // Bottom-nav-only destination is reachable.
      await expect(
        page.getByTestId("mobile-bottom-nav").getByRole("link", { name: "내 지원" }),
      ).toBeVisible();
    } else {
      await expect(page.getByTestId("desktop-nav")).toBeVisible();
      await expect(page.getByTestId("mobile-bottom-nav")).toBeHidden();
      // Desktop-nav-only destination is reachable.
      await expect(
        page.getByTestId("desktop-nav").getByRole("link", { name: "고용주" }),
      ).toBeVisible();
    }
  });

  test("no horizontal overflow on core public pages", async ({ page }) => {
    for (const path of ["/", "/jobs", "/jobs/kw-001"]) {
      await page.goto(path);
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow at ${path}`).toBe(false);
    }
  });
});
