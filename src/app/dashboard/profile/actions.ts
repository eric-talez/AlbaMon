"use server";

import { requireUser } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateOwnProfile(formData: FormData): Promise<{
  status: "success" | "error"; message: string;
}> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length < 1 || displayName.length > 80) {
    return { status: "error", message: "표시 이름은 1~80자로 입력해 주세요." };
  }
  const user = await requireUser("/dashboard/profile");
  if (user.isDev) return { status: "error", message: "프로필 저장은 연결된 계정에서 이용해 주세요. (A connected account is required.)" };
  try {
    const supabase = await createSupabaseServerClient();
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
