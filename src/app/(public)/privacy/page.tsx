import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <ComingSoon
      title="개인정보처리방침"
      subtitle="Privacy Policy"
      description="개인정보 수집·이용 및 보호 정책을 준비 중입니다. 정식 문구는 법률 검토 후 게시됩니다."
    />
  );
}
