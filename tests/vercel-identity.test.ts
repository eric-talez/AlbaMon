import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/check-vercel-identity.mjs");
const roots: string[] = [];
const sha = "a".repeat(40);
function run(patch: { link?: object; project?: object; deployment?: object; env?: object; preflight?: boolean; malformed?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vercel-identity-")); roots.push(root);
  mkdirSync(join(root, ".vercel"));
  writeFileSync(join(root, ".vercel/project.json"), JSON.stringify({ orgId: "team_approved", projectId: "prj_approved", ...patch.link }));
  writeFileSync(join(root, "project.json"), JSON.stringify({ id: "prj_approved", accountId: "team_approved", name: "approved-service", ...patch.project }));
  writeFileSync(join(root, "deployment.json"), patch.malformed ? "not json SECRET" : JSON.stringify({ id: "dpl_candidate", projectId: "prj_approved", ownerId: "team_approved", url: "candidate.vercel.app", target: "production", readyState: "READY", meta: { releaseCommit: sha }, ...patch.deployment }));
  return spawnSync(process.execPath, [script, "project.json", ...(patch.preflight ? [] : ["deployment.json"])], { cwd: root, encoding: "utf8", env: { ...process.env, APPROVED_VERCEL_ORG_ID: "team_approved", APPROVED_VERCEL_PROJECT_ID: "prj_approved", APPROVED_VERCEL_PROJECT_NAME: "approved-service", APPROVED_RELEASE_SHA: sha, APPROVED_DEPLOYMENT_URL: "https://candidate.vercel.app", ...patch.env } });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("allows approved linked project preflight before an artifact exists", () => expect(run({ preflight: true }).status).toBe(0));
test("allows only the recorded ready Production artifact and clean-source metadata", () => expect(run().status).toBe(0));
test.each([
  { link: { orgId: "team_other" } }, { link: { projectId: "prj_other" } },
  { project: { accountId: "team_other" } }, { project: { id: "prj_other" } }, { project: { name: "other-service" } },
  { deployment: { ownerId: "team_other" } }, { deployment: { projectId: "prj_other" } },
  { deployment: { url: "other.vercel.app" } }, { deployment: { id: "" } },
  { deployment: { target: "preview" } }, { deployment: { readyState: "ERROR" } },
  { deployment: { meta: {} } }, { deployment: { meta: { releaseCommit: "b".repeat(40) } } },
  { deployment: { gitSource: { sha: "b".repeat(40) } } },
  { env: { APPROVED_RELEASE_SHA: "" } }, { env: { APPROVED_VERCEL_ORG_ID: "" } },
  { env: { APPROVED_VERCEL_PROJECT_ID: "" } }, { env: { APPROVED_DEPLOYMENT_URL: "" } },
  { env: { APPROVED_VERCEL_PROJECT_NAME: "" } },
  { env: { VERCEL_ORG_ID: "team_other" } }, { env: { VERCEL_PROJECT_ID: "prj_other" } },
])("rejects wrong/missing identity before allowing a hosted action: %j", patch => expect(run(patch).status).toBe(1));
test("does not leak protected JSON in an invalid-input diagnostic", () => {
  const result = run({ malformed: true });
  expect(result.status).toBe(1); expect(result.stderr).not.toContain("SECRET");
});
