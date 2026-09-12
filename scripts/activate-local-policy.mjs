import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { policyAcceptanceIdentity } from "../src/lib/policy-publication.mjs";

// Historical migration seed is immutable. This bootstrap only advances that
// initial pointer on the owned disposable stack; it is never a hosted updater.
const initialIdentity = "draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7";
export async function activateLocalPolicy(status, identity = policyAcceptanceIdentity(), fetcher = fetch) {
  let db;
  try { db = new URL(status.DB_URL); } catch { throw new Error("Owned isolated stack required"); }
  if (status.API_URL !== "http://127.0.0.1:55321" || db.hostname !== "127.0.0.1" || db.port !== "55322" || db.pathname !== "/postgres" || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Owned isolated stack required");
  if (!/^(draft|reviewed):[0-9a-f]{64}$/.test(identity)) throw new Error("Invalid bundled policy identity");
  async function rpc(name, body, key) {
    try {
      const response = await fetcher(`${status.API_URL}/rest/v1/rpc/${name}`, {method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw Error();
      return name === "current_policy_identity" ? await response.json() : undefined;
    } catch { throw new Error("Local policy RPC failed; no automatic retry or pointer repair"); }
  }
  const current = await rpc("current_policy_identity",{},status.ANON_KEY);
  if (current === identity) return;
  if (current !== initialIdentity) throw new Error("Different active policy requires an explicit reviewed transition; bootstrap refused");
  await rpc("activate_policy_publication",{expected_identity:initialIdentity,next_identity:identity},status.SERVICE_ROLE_KEY);
  if (await rpc("current_policy_identity",{},status.ANON_KEY) !== identity) throw new Error("Local policy readback mismatch");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const status = JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}));
    await activateLocalPolicy(status);
    console.log("Owned local database matches current bundled policy; no user/job acceptance inferred.");
  } catch { console.error("Local policy setup failed; inspect target/pointer through protected tooling. No automatic retry."); process.exitCode = 1; }
}
