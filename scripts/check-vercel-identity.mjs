import { readFileSync } from "node:fs";

// Read-only gate over protected, freshly fetched Vercel API records. Never print
// API bodies: deployment responses can contain private configuration.
try {
  const [projectPath, deploymentPath, ...extra] = process.argv.slice(2);
  const env = process.env;
  const org = env.APPROVED_VERCEL_ORG_ID;
  const projectId = env.APPROVED_VERCEL_PROJECT_ID;
  const projectName = env.APPROVED_VERCEL_PROJECT_NAME;
  const sha = env.APPROVED_RELEASE_SHA;
  const requireMatch = (condition) => { if (!condition) throw new Error("identity mismatch"); };
  requireMatch(projectPath && extra.length === 0 && org && projectId && projectName && /^[a-f0-9]{40}$/.test(sha ?? ""));
  requireMatch(!env.VERCEL_ORG_ID || env.VERCEL_ORG_ID === org);
  requireMatch(!env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_ID === projectId);
  const link = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  const project = JSON.parse(readFileSync(projectPath, "utf8"));
  requireMatch(link.orgId === org && link.projectId === projectId);
  requireMatch(project.id === projectId && project.accountId === org && project.name === projectName);
  if (deploymentPath) {
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
    requireMatch(deployment.ownerId === org && deployment.projectId === projectId);
    requireMatch(typeof deployment.id === "string" && deployment.id.startsWith("dpl_"));
    requireMatch(typeof deployment.url === "string" && /^[a-z0-9-]+\.vercel\.app$/.test(deployment.url));
    requireMatch(env.APPROVED_DEPLOYMENT_URL === `https://${deployment.url}`);
    requireMatch(deployment.target === "production" && deployment.readyState === "READY");
    requireMatch(deployment.meta?.releaseCommit === sha);
    requireMatch(!deployment.gitSource?.sha || deployment.gitSource.sha === sha);
  }
  console.log("Vercel identity verified against approved record");
} catch {
  console.error("Vercel identity check failed; stop and review protected records");
  process.exitCode = 1;
}
