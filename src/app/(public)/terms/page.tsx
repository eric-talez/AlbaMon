import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <ComingSoon
      title="이용약관"
      subtitle="Terms of Service"
      description="서비스 이용약관 전문을 준비 중입니다. 정식 문구는 법률 검토 후 게시됩니다."
    />
  );
}
