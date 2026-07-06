import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "공고 등록 정책",
  description:
    "K-Work US 공고 등록 정책 (Job Posting Policy). 공고는 직무 관련 언어 요건만 명시할 수 있으며, 국적·민족·시민권·비자 상태 등 보호 대상에 따른 제한은 허용되지 않습니다.",
};

export default function PostingPolicyPage() {
  return (
    <ComingSoon
      title="공고 등록 정책"
      subtitle="Job Posting Policy"
      description="공고는 직무 관련 언어 요건만 명시할 수 있으며, 국적·민족·시민권·비자 상태 등 보호 대상에 따른 제한은 허용되지 않습니다. 상세 정책을 준비 중입니다."
    />
  );
}
