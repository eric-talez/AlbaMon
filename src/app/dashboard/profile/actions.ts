"use server";

import { policyAcceptanceIdentity } from "@/lib/policy-publication.mjs";
import { hasCurrentPolicies, TERMS_VERSION, PRIVACY_NOTICE_VERSION, POLICY_WRITE_MESSAGE } from "@/lib/policies";
import { activeWriterError, requireUser } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateOwnProfile(formData: FormData): Promise<{
  status: "success" | "error"; message: string;
}> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length < 1 || displayName.length > 80) {
    return { status: "error", message: "표시 이름은 1~80자로 입력해 주세요." };
  }
  const user = await requireUser("/dashboard/profile");
  const writerError = activeWriterError(user, { acknowledgingPolicies: true });
  if (writerError) return writerError;
  if (user.isDev) return { status: "error", message: "프로필 저장은 연결된 계정에서 이용해 주세요. (A connected account is required.)" };
  const acknowledge = !hasCurrentPolicies(user, policyAcceptanceIdentity());
  if (acknowledge && (formData.get("policyIdentity") !== policyAcceptanceIdentity() || formData.get("agreeTerms") !== TERMS_VERSION || formData.get("confirmPrivacyNotice") !== PRIVACY_NOTICE_VERSION)) {
    return { status: "error", message: POLICY_WRITE_MESSAGE };
  }
  try {
    const supabase = await createSupabaseServerClient();
    if (acknowledge) {
      const { error } = await supabase.rpc("acknowledge_policies", { terms: TERMS_VERSION, agree_terms: true, privacy_notice: PRIVACY_NOTICE_VERSION, confirm_privacy_notice: true, publication_identity: policyAcceptanceIdentity() });
      if (error) return { status: "error", message: POLICY_WRITE_MESSAGE };
    }
    const { data, error } = await supabase.from("profiles")
      .update({ display_name: displayName,
        ...(formData.has("city") ? { city: String(formData.get("city") ?? "").trim() || null } : {}),
        ...(formData.has("emailNotificationsEnabled") ? { email_notifications_enabled: formData.get("emailNotificationsEnabled") === "true" } : {}),
      }).eq("id", user.id).select("id").maybeSingle();
    if (!error && data) return { status: "success", message: "프로필을 저장했습니다. (Profile saved.)" };
  } catch {
    // Return a fixed message without exposing database details.
  }
  return { status: "error", message: "프로필을 저장하지 못했습니다. 다시 시도해 주세요. (Could not save profile. Please retry.)" };
}
