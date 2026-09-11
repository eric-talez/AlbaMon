export const TERMS_VERSION = "ca-launch-v1";
export const PRIVACY_NOTICE_VERSION = "ca-launch-v1";
export const POSTING_POLICY_VERSION = "ca-launch-v1";
export const POLICY_WRITE_MESSAGE = "프로필에서 이용약관 동의와 개인정보 안내 확인을 완료해 주세요. (Review policies at /dashboard/profile before writing.)";
export function hasCurrentPolicies(user: { termsVersion?: string | null; termsAcceptedAt?: string | null; privacyNoticeVersion?: string | null; privacyNoticeAcknowledgedAt?: string | null }) {
  return user.termsVersion === TERMS_VERSION && !!user.termsAcceptedAt &&
    user.privacyNoticeVersion === PRIVACY_NOTICE_VERSION && !!user.privacyNoticeAcknowledgedAt;
}
