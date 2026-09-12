"use client";

import Link from "next/link";
import { TERMS_VERSION, PRIVACY_NOTICE_VERSION } from "@/lib/policies";
import { useState } from "react";
import { sanitizeNextPath } from "@/lib/auth/redirect";
import { updateOwnProfile } from "./actions";

export function ProfileForm({ displayName, city, next, emailNotificationsEnabled, policiesAcknowledged, policyIdentity }: {
  policiesAcknowledged: boolean; policyIdentity: string;
  displayName: string | null; city: string | null; next: string; emailNotificationsEnabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function save(formData: FormData) {
    setPending(true);
    setMessage("");
    try {
      const result = await updateOwnProfile(formData);
      setMessage(result.message);
      if (result.status === "success") {
        window.location.assign(sanitizeNextPath(formData.get("next")));
      }
    } catch {
      setMessage("저장 중 문제가 발생했습니다. 다시 로그인해 주세요. (Please sign in and try again.)");
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={save} className="mt-6 space-y-4">
      <input type="hidden" name="policyIdentity" value={policyIdentity} />
      <input type="hidden" name="next" value={sanitizeNextPath(next)} />
      <label className="block text-sm font-medium">
        표시 이름 / Display name
        <input name="displayName" required maxLength={80} defaultValue={displayName ?? ""}
          autoComplete="nickname" className="mt-1 block w-full rounded-lg border border-border p-3" />
      </label>
      <label className="block text-sm font-medium">
        도시 (선택) / City (optional)
        <input name="city" defaultValue={city ?? ""} autoComplete="address-level2"
          className="mt-1 block w-full rounded-lg border border-border p-3" />
      </label>
      <label className="block text-sm font-medium">
        이메일 알림 / Email notifications
        <select name="emailNotificationsEnabled" defaultValue={String(emailNotificationsEnabled)}
          className="mt-1 block w-full rounded-lg border border-border p-3">
          <option value="true">받기 / Enabled</option>
          <option value="false">받지 않기 / Disabled</option>
        </select>
      </label>
      {policiesAcknowledged ? <p>현행 정책 확인 기록이 있습니다. (Current policies acknowledged.)</p> : <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend>정책 확인 / Policy acknowledgement</legend>
        <p className="text-sm">게시된 문서를 확인해 주세요. 검토 초안 표시는 공개 효력이 확정되지 않았음을 뜻합니다. (Draft status means launch terms are not finalized.)</p>
        <label className="block"><input type="checkbox" name="agreeTerms" value={TERMS_VERSION} required /> <Link href="/terms" target="_blank" className="underline">이용약관 / Terms</Link>에 동의합니다. (I agree.)</label>
        <label className="block"><input type="checkbox" name="confirmPrivacyNotice" value={PRIVACY_NOTICE_VERSION} required /> <Link href="/privacy" target="_blank" className="underline">개인정보 안내 / Privacy notice</Link>를 확인했습니다. (I have read the notice.)</label>
        <p className="text-sm">개인정보 안내 확인은 선택적인 마케팅 동의가 아닙니다. 알림 설정은 별도로 선택합니다. (Notice acknowledgement is separate from notification preferences.)</p>
      </fieldset>}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <button disabled={pending} className="rounded-lg bg-brand px-4 py-3 font-medium text-brand-foreground disabled:opacity-60">
        {pending ? "저장 중… (Saving…)" : "저장하고 계속 / Save and continue"}
      </button>
    </form>
  );
}
