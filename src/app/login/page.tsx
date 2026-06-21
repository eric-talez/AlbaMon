import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <ComingSoon
      title="로그인 / 회원가입"
      subtitle="Sign in"
      description="로그인 및 회원가입 기능을 준비 중입니다 (Slice 2 — 인증/역할)."
    />
  );
}
