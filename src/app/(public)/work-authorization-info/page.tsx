import type { Metadata } from "next";
import { PolicyDocument } from "@/components/PolicyDocument";
export const metadata: Metadata = { title: "근로자격 안내 / Work Authorization Information", description: "개인의 취업 자격을 판단하지 않으며 법률 자문을 제공하지 않습니다. / General work authorization information." };
export default function Page() { return <PolicyDocument policy="work-authorization-info" />; }
