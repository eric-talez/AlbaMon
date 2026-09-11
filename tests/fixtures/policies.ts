import { policyAcceptanceIdentity } from "../../src/lib/policy-publication.mjs";
// Unit fixtures only; actual acknowledgement evidence uses authenticated RPC/forms.
export const acknowledgedPolicies = { policyIdentity: policyAcceptanceIdentity(), termsVersion: "ca-launch-v1", termsAcceptedAt: "2026-09-10T00:00:00Z", privacyNoticeVersion: "ca-launch-v1", privacyNoticeAcknowledgedAt: "2026-09-10T00:00:00Z" };
export const unacknowledgedPolicies = { policyIdentity: null, termsVersion: null, termsAcceptedAt: null, privacyNoticeVersion: null, privacyNoticeAcknowledgedAt: null };
