import type { Metadata } from "next";
import { PolicyDocument } from "@/components/PolicyDocument";
export const metadata: Metadata = { title: "개인정보처리방침 / Privacy Notice", description: "K-Work US 정책·운영 사실과 검토 결정 안내 / Policy information and review decisions." };
export default function Page() { return <PolicyDocument policy="privacy" />; }
