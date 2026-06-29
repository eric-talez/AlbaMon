/**
 * Standard work-authorization disclaimer (from docs/PRODUCT_BRIEF.md §8.1).
 * Shown across job, application, and posting flows. Information only — not
 * legal advice. The platform does not determine employment eligibility.
 */
export function WorkAuthorizationDisclaimer() {
  return (
    <aside
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/20"
      role="note"
      aria-label="근로 자격 안내"
    >
      <p className="font-semibold text-warning">
        근로 자격 및 고용 관련 법규 안내
      </p>
      <p className="mt-1 leading-6 text-foreground/80">
        K-Work US는 근로 자격, 비자/이민 자격, 임금 준수 여부, 세금 분류를
        판단하지 않습니다. 고용주와 지원자는 관련 법규를 직접 확인하고 준수해야
        합니다.
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        K-Work US does not determine work authorization, immigration eligibility,
        wage compliance, or tax classification. Employers and applicants are
        responsible for following applicable laws. This is general information
        only, not legal advice.
      </p>
    </aside>
  );
}
