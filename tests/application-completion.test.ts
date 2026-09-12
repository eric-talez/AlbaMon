import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("react",async original=>({...await original<object>(),useActionState:()=>[{status:"success",message:"지원했습니다"},()=>{},false]}));
import { ApplicationForm } from "@/app/(public)/jobs/[id]/apply/ApplicationForm";
it("successful application leads directly to the existing application history",()=>{
  const html=renderToStaticMarkup(createElement(ApplicationForm,{jobId:"owned-job"}));
  expect(html).toContain('href="/dashboard/applications"');
  expect(html).not.toContain("다음 지원자 대시보드 슬라이스");
});
