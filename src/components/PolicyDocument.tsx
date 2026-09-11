import { policyContent, policyFacts, validatePolicyPublication } from "@/lib/policy-publication.mjs";
const factLabels: Record<string, string> = {
  operatorLegalName: "운영 주체 / Operator", mailingAddress: "우편 주소 / Mailing address", supportEmail: "문의·개인정보 요청 / Support and privacy requests", effectiveDate: "적용일 / Effective date", controllingLanguage: "효력 언어 / Controlling language", minimumAgePolicy: "연령·미성년자 / Age policy", appealsAndTermination: "이의신청·계정 종료 / Appeals and termination", disputeTerms: "분쟁·책임 조항 / Disputes and liability", changeNotice: "정책 변경 공지 / Change notices", retentionSchedule: "항목별 보관·삭제·예외 / Retention and exceptions", privacyRequestProcess: "본인 확인·요청·응답 절차 / Request process", trackingAndSignals: "추적·판매/공유·DNT/GPC / Tracking and signals", processorDeployment: "실제 처리업체·지역·설정 / Verified processors", legalApplicability: "적용 법률 검토 / Legal applicability",
};
export function PolicyDocument({ policy }: { policy: keyof typeof policyContent }) {
  const document = policyContent[policy];
  const draft = validatePolicyPublication().length > 0;
  return <main className="mx-auto w-full max-w-3xl px-4 py-10">
    <p className="rounded-lg border border-border bg-surface p-4 font-semibold">{draft ? "검토 초안 / Draft for review — 실제 운영 사실과 외부 검토가 미확정이며 공개 효력 정책이 아닙니다." : "검토된 정책 / Reviewed policy"}</p>
    <h1 className="mt-6 text-3xl font-bold">{document.title}</h1>
    <p className="mt-2 text-sm text-muted">K-Work US · {policyFacts.version}</p>
    <p lang="en" className="mt-4 leading-7">{document.summary}</p>
    {document.sections.map(([title, body]) => <section key={title} className="mt-8">
      <h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 whitespace-pre-line leading-7">{body}</p>
    </section>)}
    {"links" in document && <section className="mt-8"><h2 className="text-xl font-semibold">공식 자료 / Official resources</h2><ul className="mt-3 space-y-2">{document.links.map(([title, url]) => <li key={url}><a className="underline" href={url}>{title}</a></li>)}</ul></section>}
    <section className="mt-8 rounded-lg border border-border p-5"><h2 className="text-xl font-semibold">운영 사실과 검토 결정 / Operator facts and decisions</h2>
      {draft && <p className="mt-3">아래 미확정 항목은 공개 전 실제 담당자가 확정하고 외부 검토해야 합니다. 연락처가 없으면 접수 채널이 운영 중이라고 볼 수 없습니다. (Unresolved facts and review block public launch.)</p>}
      <dl className="mt-4 space-y-4">{Object.entries(policyFacts.facts).map(([key, value]) => <div key={key}><dt className="font-medium">{factLabels[key]}</dt><dd className="mt-1 whitespace-pre-line leading-7">{value || "미확정 / Not yet confirmed"}</dd></div>)}</dl>
    </section>
  </main>;
}
