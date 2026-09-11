import { expect, test } from "vitest";
import { hasCurrentPolicies } from "@/lib/policies";
import { validatePolicyPublication } from "../src/lib/policy-publication.mjs";
import { syntheticPublication } from "./fixtures/policy-publication.mjs";
import { policyContent } from "../src/lib/policy-publication.mjs";
import facts from "../src/lib/policy-facts.json";
test("incomplete facts and absent external review cannot publish", () => {
  expect(validatePolicyPublication(facts).length).toBeGreaterThan(0);
});
test("both current acknowledgement versions and clocks are required", () => {
  const current = {termsVersion:"ca-launch-v1",termsAcceptedAt:"2026-09-10T00:00:00Z",privacyNoticeVersion:"ca-launch-v1",privacyNoticeAcknowledgedAt:"2026-09-10T00:00:00Z"};
  expect(hasCurrentPolicies(current)).toBe(true);
  for (const key of Object.keys(current)) expect(hasCurrentPolicies({...current,[key]:null})).toBe(false);
  expect(hasCurrentPolicies({...current,termsVersion:"old"})).toBe(false);
});

test("synthetic reviewed facts pass only for the exact reviewed content and decisions", () => {
  const config = syntheticPublication();
  expect(validatePolicyPublication(config)).toEqual([]);
  for (const key of Object.keys(config.facts)) {
    const changed = structuredClone(config); changed.facts[key as keyof typeof changed.facts] = null;
    expect(validatePolicyPublication(changed).length).toBeGreaterThan(0);
  }
  expect(validatePolicyPublication({ ...config, review: { completedAt: null, evidenceReference: null, bundleSha256: null } }).length).toBeGreaterThan(0);
  const changed = structuredClone(policyContent); changed.terms.summary += "changed";
  expect(validatePolicyPublication(config, changed)).toContain("reviewed policy bundle digest");
});
test("removing a required field from the shipped manifest cannot shrink the schema", () => {
  const original = facts.facts;
  try {
    Reflect.set(facts, "facts", Object.fromEntries(Object.entries(original).filter(([key]) => key !== "operatorLegalName")));
    expect(validatePolicyPublication(syntheticPublication())).toContain("operatorLegalName");
  } finally { Reflect.set(facts, "facts", original); }
});
