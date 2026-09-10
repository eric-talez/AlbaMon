import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guards";
import { getProfileByUserId } from "@/lib/db/profiles";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "프로필 / Profile" };
export default async function ProfilePage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await requireUser("/dashboard/profile");
  const profile = user.isDev ? null : await getProfileByUserId(user.id);
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">프로필 / Profile</h1>
      <p className="mt-2 text-sm text-muted">지원 시 사용할 표시 이름을 입력해 주세요. (Choose the name shown with your applications.)</p>
      <p className="mt-2 text-sm text-muted">연락처는 인증된 계정 이메일을 사용합니다. (Contact uses your verified account email.)</p>
      <ProfileForm emailNotificationsEnabled={profile?.email_notifications_enabled ?? true} displayName={user.displayName} city={profile?.city ?? null} next={sanitizeNextPath(next)} />
    </main>
  );
}
