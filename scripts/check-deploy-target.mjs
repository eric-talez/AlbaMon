import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

// Origin inputs are exact destinations: never discard URL components or whitespace.
export function publicOrigin(value) {
  try {
    if (typeof value !== "string" || value.trim() !== value || !/^https:\/\/[^/?#\\\s]+\/?$/.test(value)) throw Error();
    const url = new URL(value);
    const hostname = url.hostname.replace(/\.$/, "");
    const labels = hostname.split(".");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" ||
        isIP(hostname) || hostname === "localhost" || hostname.endsWith(".localhost") ||
        hostname.length > 253 || labels.length < 2 || labels.some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) throw Error();
    url.hostname = hostname;
    return url.origin;
  } catch { throw new Error("Target requires an exact public HTTPS origin"); }
}
export function checkDeployTarget(target, env = process.env) {
  if (!["staging", "production", "recovery"].includes(target)) throw new Error("Choose staging, production or recovery explicitly");
  const targets = target === "recovery" ? ["staging", "production", "recovery"] : ["staging", "production"];
  const tuples = targets.map(name => {
    const projectRef = env[`${name.toUpperCase()}_PROJECT_REF`];
    if (!/^[a-z0-9]{20}$/.test(projectRef ?? "")) throw new Error(`Missing or invalid ${name} project ref`);
    return {target:name, projectRef, origin:publicOrigin(env[`${name.toUpperCase()}_ORIGIN`])};
  });
  if (new Set(tuples.map(t => t.projectRef)).size !== tuples.length || new Set(tuples.map(t => t.origin)).size !== tuples.length) throw new Error("Deployment targets must be isolated");
  const selected = tuples.find(t => t.target === target);
  if (publicOrigin(env.NEXT_PUBLIC_SITE_URL) !== selected.origin || publicOrigin(env.NEXT_PUBLIC_SUPABASE_URL) !== `https://${selected.projectRef}.supabase.co`) throw new Error("Deployment origin or Supabase project mismatch");
  if (target !== "recovery" && (env.EMAIL_ENVIRONMENT !== target || env.NEXT_PUBLIC_INDEXING_ENABLED !== String(target === "production"))) throw new Error("Deployment email or indexing environment mismatch");
  if (env.VERCEL_ENV === "preview" && target !== "staging") throw new Error("Vercel Preview must use staging");
  if (env.VERCEL_ENV === "production" && target !== "production") throw new Error("Vercel Production must use production");
  return selected;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(checkDeployTarget(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
