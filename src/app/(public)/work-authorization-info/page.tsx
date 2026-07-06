import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "근로자격 안내",
  description:
    "근로 자격(work authorization) 일반 정보 안내. K-Work US는 개인의 취업 자격을 판단하지 않으며, 법률 자문을 제공하지 않습니다.",
};

export default function WorkAuthorizationInfoPage() {
  return (
    <ComingSoon
      title="근로자격 안내"
      subtitle="Work Authorization Information"
      description="본 플랫폼은 개인의 미국 내 취업 자격을 판단하지 않습니다. 일반 정보 제공 목적이며 법률 자문이 아닙니다. F-1 학생은 교내 DSO와 상담하시기 바랍니다. 상세 안내를 준비 중입니다."
    />
  );
}
