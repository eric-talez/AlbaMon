import { test, expect } from "@playwright/test";

const approvedJob = "bbbbbbbb-0000-0000-0000-000000000001";
const pendingJob = "bbbbbbbb-0000-0000-0000-000000000101";
const draftJob = "bbbbbbbb-0000-0000-0000-000000000102";

test("public jobs show real approved rows and safe company identity", async ({ page }) => {
  // Filter this test's seed company so concurrent pagination fixtures cannot evict it.
  await page.goto("/jobs?q=Koreatown%20Kitchen%20Collective");
  await expect(page.getByRole("heading", { name: "공고 둘러보기", exact: true })).toBeVisible();
  // Seed UUID links distinguish live DB results from development mock slugs.
  await expect(page.locator(`a[href="/jobs/${approvedJob}"]`)).toBeVisible();
  await expect(page.getByText("Koreatown Kitchen Collective").first()).toBeVisible();
  await expect(page.locator(`a[href="/jobs/${pendingJob}"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="/jobs/${draftJob}"]`)).toHaveCount(0);
});

// Parent layouts may redirect first; both the area and exact page are safe returns.
for (const [path, area] of [
  ["/employer/jobs/new", "/employer"],
  ["/admin/jobs", "/admin"],
  ["/dashboard/applications", "/dashboard"],
]) {
  test(`signed-out ${path} requires login with a return destination`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL((url) =>
      url.pathname === "/login" && [area, path].includes(url.searchParams.get("next") ?? ""),
    );
  });
}

test("anonymous REST exposes safe jobs but rejects private company columns", async ({ request }) => {
  const api = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
  const headers = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };
  const publicRows = await request.get(`${api}/public_job_listings?select=*`, { headers });
  expect(publicRows.ok()).toBe(true);
  const rows = await publicRows.json();
  expect(rows.length).toBeGreaterThanOrEqual(8);
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: approvedJob, company_name: "Koreatown Kitchen Collective" }),
  ]));
  for (const row of rows) {
    expect(row.moderation_status).toBe("approved");
    for (const column of ["owner_id", "phone", "website", "company_id"]) {
      expect(row).not.toHaveProperty(column);
    }
  }
  const privateRows = await request.get(`${api}/companies?select=owner_id,phone`, { headers });
  expect(privateRows.ok()).toBe(false);
  // PostgREST HTTP mapping differs for anon/authenticated; SQLSTATE is the contract.
  expect(await privateRows.json()).toMatchObject({ code: "42501" });
});
