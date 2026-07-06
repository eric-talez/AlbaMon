import Link from "next/link";
import {
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  JOB_TYPES,
  JOB_TYPE_LABELS,
  LANGUAGE_REQUIREMENTS,
  LANGUAGE_REQUIREMENT_LABELS,
} from "@/lib/types";
import type { JobSearchParams } from "@/lib/db/jobs";
import { LAUNCH_CITIES } from "@/lib/site";

function Field({
  id,
  label,
  children,
}: {
  /** id of the contained control, for explicit label association. */
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const controlClass =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground";

/**
 * Public job filters (Slice 4). A plain GET form that submits the query params
 * read by `/jobs` — it works without JavaScript and keeps the filter state in
 * the URL. `values` are the currently-applied filters (echoed back as defaults).
 */
export function JobFilters({ values = {} }: { values?: JobSearchParams }) {
  return (
    <form
      method="get"
      action="/jobs"
      className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="공고 필터"
    >
      <Field id="filter-q" label="검색어 (Keyword)">
        <input
          id="filter-q"
          type="text"
          name="q"
          defaultValue={values.q ?? ""}
          placeholder="직무, 회사, 내용"
          className={controlClass}
        />
      </Field>

      <Field id="filter-city" label="지역 (City)">
        <select
          id="filter-city"
          name="city"
          className={controlClass}
          defaultValue={values.city ?? ""}
        >
          <option value="">전체 지역</option>
          {LAUNCH_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field id="filter-category" label="업종 (Category)">
        <select
          id="filter-category"
          name="category"
          className={controlClass}
          defaultValue={values.category ?? ""}
        >
          <option value="">전체 업종</option>
          {JOB_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {JOB_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="filter-jobType" label="고용 형태 (Job type)">
        <select
          id="filter-jobType"
          name="jobType"
          className={controlClass}
          defaultValue={values.jobType ?? ""}
        >
          <option value="">전체</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="filter-languageRequirement" label="언어 요건 (Language)">
        <select
          id="filter-languageRequirement"
          name="languageRequirement"
          className={controlClass}
          defaultValue={values.languageRequirement ?? ""}
        >
          <option value="">전체</option>
          {LANGUAGE_REQUIREMENTS.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_REQUIREMENT_LABELS[l]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="filter-payMin" label="최소 급여 (Min pay)">
        <input
          id="filter-payMin"
          type="number"
          name="payMin"
          min={0}
          step={1}
          inputMode="numeric"
          defaultValue={values.payMin ?? ""}
          placeholder="예: 20"
          className={controlClass}
        />
      </Field>

      <Field id="filter-sort" label="정렬 (Sort)">
        <select
          id="filter-sort"
          name="sort"
          className={controlClass}
          defaultValue={values.sort ?? "newest"}
        >
          <option value="newest">최신순</option>
          <option value="pay_high">급여 높은순</option>
          <option value="pay_low">급여 낮은순</option>
        </select>
      </Field>

      <div className="col-span-full flex items-center gap-3">
        <button
          type="submit"
          className="flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          검색 (Search)
        </button>
        <Link
          href="/jobs"
          className="text-sm text-muted transition-colors hover:text-brand"
        >
          필터 초기화 / Reset
        </Link>
      </div>
    </form>
  );
}
