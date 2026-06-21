import {
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  LANGUAGE_REQUIREMENTS,
  LANGUAGE_REQUIREMENT_LABELS,
} from "@/lib/types";
import { LAUNCH_CITIES } from "@/lib/site";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground";

/**
 * Filter UI placeholders (Slice 1). These are visual only; real URL-based
 * filtering is wired up in Slice 4. Controls are disabled to signal that.
 */
export function JobFilters() {
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="공고 필터 (준비 중)"
    >
      <Field label="지역 (City)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">전체 지역</option>
          {LAUNCH_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="업종 (Category)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">전체 업종</option>
          {JOB_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {JOB_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="고용 형태 (Job type)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">전체</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="언어 요건 (Language)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">전체</option>
          {LANGUAGE_REQUIREMENTS.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_REQUIREMENT_LABELS[l]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="최소 시급 (Min pay)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">무관</option>
          <option value="17">$17+</option>
          <option value="20">$20+</option>
          <option value="25">$25+</option>
        </select>
      </Field>

      <Field label="근무 시간대 (Schedule)">
        <select className={selectClass} defaultValue="" disabled>
          <option value="">무관</option>
          <option value="morning">오전</option>
          <option value="afternoon">오후</option>
          <option value="evening">저녁</option>
          <option value="weekend">주말</option>
        </select>
      </Field>

      <p className="col-span-full text-xs text-muted">
        필터는 Slice 4에서 실제 검색과 연동됩니다. 현재는 미리보기입니다.
      </p>
    </form>
  );
}
