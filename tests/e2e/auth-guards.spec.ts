import { test, expect, devLogin } from "./helpers";

/**
 * Scenario 3 — dev-auth sign-in and the server-side guard matrix. All guards
 * run in server-component layouts/pages (no middleware). Signed-out → /login
 * with a safe, URL-encoded `next`; wrong role → /forbidden; the employer area
 * gives seekers a request-access recovery path. (Runs on the desktop project
 * only — auth is not viewport-specific.)
 */

test.describe("signed-out access redirects to login with safe next", () => {
  for (const path of ["/dashboard", "/employer", "/admin"]) {
    test(`${path} redirects to /login?next=${encodeURIComponent(path)}`, async ({
      page,
    }) => {
      await page.context().clearCookies();
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?next=${encodeURIComponent(path)}`),
      );
      await expect(
        page.getByRole("heading", { name: /개발 모드 로그인/ }),
      ).toBeVisible();
    });
  }
});

test.describe("dev-auth sign-in and route access matrix", () => {
  test("seeker: dashboard OK, admin forbidden, employer area → request-access", async ({
    page,
  }) => {
    await devLogin(page, "seeker");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("button", { name: "로그아웃" }),
    ).toBeVisible();

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(
      page.getByRole("heading", { name: "이 페이지에 접근할 수 없습니다" }),
    ).toBeVisible();

    await page.goto("/employer");
    await expect(page).toHaveURL(/\/employer\/request-access$/);
  });

  test("employer: employer home OK, admin forbidden, seeker-only page forbidden", async ({
    page,
  }) => {
    await devLogin(page, "employer");
    await expect(page).toHaveURL(/\/employer$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/forbidden$/);

    // /dashboard/applications is seeker-only (exact requireRole).
    await page.goto("/dashboard/applications");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("admin: admin OK, but forbidden on employer sub-pages (exact role)", async ({
    page,
  }) => {
    await devLogin(page, "admin");
    await expect(page).toHaveURL(/\/admin$/);
    // Authenticated admin session rendered (AccountBar sign-out control).
    await expect(
      page.getByRole("button", { name: "로그아웃" }),
    ).toBeVisible();

    // Admin clears the employer layout but the sub-page requires exact employer.
    await page.goto("/employer/company");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("signed-out /admin round-trips through login back to /admin", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await devLogin(page, "admin", "/admin");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("logout clears the dev session and revokes access", async ({ page }) => {
    await devLogin(page, "admin");
    await page.goto("/admin");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/$/);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "kw_dev_session")).toBeUndefined();

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});
