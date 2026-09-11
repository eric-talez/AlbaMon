import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { publicOrigin } from "./check-deploy-target.mjs";

// Read-only: never uses CRON_SECRET, user credentials, or a signed webhook.
export async function smokeDeployment(target, env = process.env, fetcher = fetch) {
  assert(["staging", "production"].includes(target), "Choose staging or production explicitly");
  const requestOrigin = publicOrigin(env.DEPLOYMENT_ORIGIN);
  const canonicalOrigin = publicOrigin(env.NEXT_PUBLIC_SITE_URL);
  const headers = env.VERCEL_AUTOMATION_BYPASS_SECRET ? {"x-vercel-protection-bypass":env.VERCEL_AUTOMATION_BYPASS_SECRET} : {};
  async function get(path, extra = {}, status = 200) {
    let response;
    try { response = await fetcher(`${requestOrigin}${path}`, {method:"GET", headers:{...headers,...extra}, redirect:"error", signal:AbortSignal.timeout(5000)}); }
    catch { throw new Error(`Smoke request failed: ${path}`); }
    assert.equal(response.status, status, `Unexpected status: ${path} (verify approved protection access if blocked)`);
    return response;
  }
  const health = await (await get("/api/health")).json();
  assert.equal(health.status,"ok"); assert.equal(health.service,"k-work-us");
  for (const name of ["siteUrl","supabase","email"]) assert.equal(health.checks?.[name],"configured",`Health configuration: ${name}`);
  const ready = await get("/api/ready");
  assert.match(ready.headers.get("cache-control") ?? "",/no-store/);
  assert.equal((await ready.json()).status,"ok");
  const jobs = await get("/jobs");
  const html = await jobs.text();
  const canonicalTags = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) ?? [];
  assert(canonicalTags.some(tag => tag.includes(`href="${canonicalOrigin}/jobs"`) || tag.includes(`href='${canonicalOrigin}/jobs'`)), "Compiled canonical mismatch");
  const crawl = jobs.headers.get("x-robots-tag") ?? "";
  if (target === "staging") { assert.match(crawl,/noindex/i); assert.match(crawl,/nofollow/i); }
  else { assert.doesNotMatch(crawl,/noindex/i); assert.doesNotMatch(html,/<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i); }
  const robots = await (await get("/robots.txt")).text();
  if (target === "staging") { assert.match(robots,/^Disallow:\s*\/\s*$/im); assert.doesNotMatch(robots,/^Sitemap:/im); }
  else { assert.doesNotMatch(robots,/^Disallow:\s*\/\s*$/im); assert(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`),"Production sitemap discovery missing"); }
  const sitemap = await (await get("/sitemap.xml")).text();
  assert.match(sitemap,/<urlset\b/);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert(locations.length > 0 && locations.every(url => url.startsWith(`${canonicalOrigin}/`)),"Sitemap origin mismatch");
  for (const body of [html,sitemap]) assert.doesNotMatch(body,/kw-?001|강남 키친|Irvine Smile Dental|Pacific Trade Logistics|Fullerton Nail Lounge|Garden Grove Academy|Torrance Coffee House|Hannam Market|West Covina Trading|Rowland Hair Studio|K-Bunsik LA|Bay Area Community Media|Sacramento Community Market|San Diego Business Center|Sunrise Bakery|Irvine Trading Co\.|Koreatown Kitchen Collective|OC Wellness (?:&|&amp;) Beauty Group|SoCal Trade (?:&|&amp;) Retail Partners|bbbbbbbb-0000-0000-0000-/i,"Public sample identity found");
  await get("/jobs/kw-001",{},404);
  await get("/api/internal/notifications",{},401);
  await get("/api/internal/notifications",{Authorization:"Smoke invalid"},401);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await smokeDeployment(process.argv[2]); console.log("Read-only deployment smoke passed; OAuth, protection enforcement, policy review, scheduling and actual delivery require separate evidence."); }
  catch { console.error("Deployment smoke failed; inspect target access, readiness, canonical/indexing and public fixture checks. No response body or credentials logged."); process.exitCode = 1; }
}
