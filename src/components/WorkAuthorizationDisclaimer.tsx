/**
 * Standard work-authorization disclaimer (from docs/PRODUCT_BRIEF.md §8.1).
 * Shown on job detail and in the application flow. Information only — not legal
 * advice. The platform does not determine an individual's eligibility to work.
 */
export function WorkAuthorizationDisclaimer() {
  return (
    <aside
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20"
      role="note"
      aria-label="근로 자격 안내"
    >
      <p className="font-semibold text-warning">근로 자격(Work Authorization) 안내</p>
      <p className="mt-1 leading-6 text-foreground/80">
        본 플랫폼은 개인의 미국 내 취업 자격을 판단하지 않습니다. 지원자는 본인의
        근로 자격 확인에 대한 책임이 있습니다. F-1 학생은 교외 취업 전 CPT/OPT 등
        취업 허가에 대해 소속 학교의 DSO와 상담하시기 바랍니다.
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        This platform does not determine your eligibility to work in the United
        States. Applicants are responsible for confirming their work
        authorization. F-1 students should consult their DSO regarding CPT/OPT or
        other employment authorization before accepting off-campus work. This is
        general information only, not legal advice.
      </p>
    </aside>
  );
}
