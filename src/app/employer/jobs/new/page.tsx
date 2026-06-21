import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "공고 등록" };

export default function NewJobPage() {
  return (
    <ComingSoon
      title="공고 등록"
      subtitle="Post a job"
      description="고용주 공고 등록 기능을 준비 중입니다 (Slice 7 — 공고 작성/검증). 모든 공고는 급여 범위와 근무시간을 필수로 입력하며 관리자 검수 후 게시됩니다."
    />
  );
}
