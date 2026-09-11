// Static imports are bundled into Next's server build and used by standalone
// release preflight. No private review documents or local runtime paths.
import { createHash } from "node:crypto";
import policyFacts from "./policy-facts.json" with { type: "json" };
import policyContent from "./policy-content.json" with { type: "json" };
export { policyFacts, policyContent };
// The required schema must not shrink when an operator removes a JSON field.
const REQUIRED_FACTS = ["operatorLegalName", "mailingAddress", "supportEmail", "effectiveDate", "controllingLanguage", "minimumAgePolicy", "appealsAndTermination", "disputeTerms", "changeNotice", "retentionSchedule", "privacyRequestProcess", "trackingAndSignals", "processorDeployment", "legalApplicability"];
export function policyBundleHash(config = policyFacts, content = policyContent) {
  return createHash("sha256").update(JSON.stringify({version: config.version, facts: config.facts, content})).digest("hex");
}
export function validatePolicyPublication(config = policyFacts, content = policyContent) {
  const issues = [];
  if (config?.version !== "ca-launch-v1" || config?.status !== "reviewed") issues.push("policy version/status");
  for (const key of REQUIRED_FACTS) {
    const value = config?.facts?.[key];
    if (typeof value !== "string" || !value.trim() || /\{\{|UNVERIFIED|TBD|미확정|example\.(com|invalid)|your-/i.test(value)) issues.push(key);
  }
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(config?.facts?.supportEmail ?? "")) issues.push("supportEmail format");
  for (const date of [config?.facts?.effectiveDate, config?.review?.completedAt]) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) issues.push("policy date");
  }
  if (typeof config?.review?.evidenceReference !== "string" || !config.review.evidenceReference.trim()) issues.push("external review evidence reference");
  if (config?.review?.bundleSha256 !== policyBundleHash(config, content)) issues.push("reviewed policy bundle digest");
  return issues;
}
