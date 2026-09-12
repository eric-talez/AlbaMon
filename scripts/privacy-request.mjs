import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Manual identity/scope evidence is required; this does not itself authenticate
 * a requester. See the runbook. There is deliberately no account-delete mode. */
export async function processPrivacyRequest(client, record, action, outputPath) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(record?.requestId ?? "") || !uuid.test(record?.subjectId ?? "") ||
      record.verifiedUserId !== record.subjectId || !record.identityEvidenceReference?.trim() ||
      !record.scopeReviewReference?.trim() || !record.allowedActions?.includes(action) ||
      !["inspect", "export", "suppress"].includes(action)) throw new Error("Verified identity and reviewed processing scope required");
  const user = await client.auth.admin.getUserById(record.subjectId);
  if (user.error || !user.data.user?.email_confirmed_at) throw new Error("Existing verified account unavailable; escalate identity review");
  let result;
  if (action === "suppress") {
    const changed = await client.from("profiles").update({ suppressed_email: true }).eq("id", record.subjectId).select("id").single();
    if (changed.error || !changed.data) throw new Error("Suppression failed");
    result = { suppressed: true };
  } else {
    const response = await client.rpc(action === "inspect" ? "privacy_request_impact" : "privacy_request_access", { subject_id: record.subjectId });
    if (response.error || !response.data) throw new Error("Privacy inspection unavailable");
    if (action === "export") {
      if (!outputPath) throw new Error("Protected export destination required");
      const text = JSON.stringify(response.data, null, 2);
      await writeFile(outputPath, text, { flag: "wx", mode: 0o600 });
      result = { candidateExportSha256: createHash("sha256").update(text).digest("hex"), manualRedactionReviewRequired: true };
    } else result = { counts: response.data };
  }
  return { requestId: record.requestId, action, completedAt: new Date().toISOString(), ...result };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, requestFile, outputPath] = process.argv.slice(2);
    const record = JSON.parse(await readFile(requestFile, "utf8"));
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
    });
    console.log(JSON.stringify(await processPrivacyRequest(client, record, action, outputPath)));
  } catch {
    // Never print request text, keys, export data, or raw SDK errors.
    console.error("Privacy request operation failed. Check verified identity, reviewed scope, destination and protected operator logs.");
    process.exitCode = 1;
  }
}
