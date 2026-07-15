import { test as base, expect, type Page } from "@playwright/test";

/**
 * Browser errors that are benign under `next dev` and must not fail a test.
 * Keep this list tight — real hydration/app errors must still surface.
 */
const IGNORED_BROWSER_ERRORS: RegExp[] = [
  /favicon\.ico/i, // no favicon asset shipped → benign 404 in dev
];

/**
 * `test` extended with an auto fixture that captures uncaught page errors and
 * `console.error` output, failing the test if any un-ignored ones occur. This
 * is how the scenarios assert "no uncaught page errors, hydration errors, or
 * unexpected console errors".
 */
export const test = base.extend<{ noBrowserErrors: void }>({
  noBrowserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        if (IGNORED_BROWSER_ERRORS.some((re) => re.test(text))) return;
        errors.push(`console.error: ${text}`);
      });
      await use();
      expect(
        errors,
        `unexpected browser errors:\n${errors.join("\n") || "(none)"}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * A stable APPROVED mock job served in dev-auth mode (no DB). `title` is the
 * full H1/heading text; `titleFragment` is a paren-free substring safe to pass
 * as a plain-string accessible-name matcher (the job-card link's accessible
 * name is the whole card, so a substring match is what's wanted).
 */
export const APPROVED_JOB = {
  id: "kw-001",
  title: "한식당 홀서버 (파트타임)",
  titleFragment: "한식당 홀서버",
} as const;

/** Irvine has exactly one approved mock job (kw-002). */
export const IRVINE_JOB = {
  city: "Irvine",
  title: "치과 프론트 데스크 리셉셔니스트",
} as const;

export type DevRole = "seeker" | "employer" | "admin";

const ROLE_RADIO: Record<DevRole, RegExp> = {
  seeker: /구직자/,
  employer: /고용주/,
  admin: /관리자/,
};

const ROLE_HOME: Record<DevRole, RegExp> = {
  seeker: /\/dashboard$/,
  employer: /\/employer$/,
  admin: /\/admin$/,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sign in through the REAL dev-auth role picker at `/login`. Asserts dev-auth
 * mode is actually active first, so a misconfigured server fails loudly instead
 * of silently exercising real auth.
 */
export async function devLogin(
  page: Page,
  role: DevRole,
  next?: string,
): Promise<void> {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await expect(
    page.getByRole("heading", { name: /개발 모드 로그인/ }),
  ).toBeVisible();
  await page.getByRole("radio", { name: ROLE_RADIO[role] }).check();
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(
    next ? new RegExp(`${escapeRegExp(next)}(?:\\?.*)?$`) : ROLE_HOME[role],
  );
}
