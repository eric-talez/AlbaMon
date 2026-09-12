// Synthetic values exercise gate mechanics only. Not actual operator approval.
import { policyFacts, policyBundleHash } from "../../src/lib/policy-publication.mjs";
export function syntheticPublication() {
  const config = structuredClone(policyFacts);
  config.status = "reviewed";
  for (const key of Object.keys(config.facts)) config.facts[key] = `Synthetic reviewed ${key} decision`;
  config.facts.supportEmail = "support@k-work.test";
  config.facts.effectiveDate = "2026-09-10";
  config.review = { completedAt: "2026-09-10", evidenceReference: "SYNTHETIC-TEST-ONLY", bundleSha256: policyBundleHash(config) };
  return config;
}
