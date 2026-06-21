/**
 * Core domain types and label maps for K-Work US.
 *
 * These mirror the data model in docs/PRODUCT_BRIEF.md. In Slice 3 they will be
 * backed by the database; for the public shell (Slice 1) they drive mock data.
 *
 * Compliance reminder: `language_requirement` is always expressed as a
 * JOB-RELATED requirement, never as a nationality/citizenship restriction.
 */

export const ROLES = ["seeker", "employer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const JOB_TYPES = [
  "part_time",
  "full_time",
  "temporary",
  "contract",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const PAY_UNITS = ["hour", "day", "week", "month", "year"] as const;
export type PayUnit = (typeof PAY_UNITS)[number];

/** Job-related language requirements (NOT nationality-based). */
export const LANGUAGE_REQUIREMENTS = [
  "korean_required",
  "korean_helpful",
  "bilingual_preferred",
  "english_required",
] as const;
export type LanguageRequirement = (typeof LANGUAGE_REQUIREMENTS)[number];

export const JOB_CATEGORIES = [
  "restaurant_cafe",
  "medical_dental_reception",
  "logistics_warehouse",
  "beauty_nail_hair",
  "education_tutoring",
  "retail",
  "office_admin",
  "other",
] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

export const MODERATION_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "paused",
  "expired",
] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const BOOST_TYPES = ["featured", "urgent"] as const;
export type BoostType = (typeof BOOST_TYPES)[number];

export type AddressDisplayMode = "full" | "city_only";

export interface Job {
  id: string;
  title: string;
  companyName: string;
  employerVerified: boolean;
  category: JobCategory;
  jobType: JobType;
  city: string;
  state: string;
  addressDisplay: string;
  addressDisplayMode: AddressDisplayMode;
  payMin: number;
  payMax: number;
  payUnit: PayUnit;
  tipsAvailable: boolean;
  scheduleDays: string;
  scheduleTimeRange: string;
  languageRequirement: LanguageRequirement;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  moderationStatus: ModerationStatus;
  boost: BoostType | null;
  postedAt: string; // ISO date
}

/* --- Korean-first label maps (bilingual where useful) --- */

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  part_time: "파트타임",
  full_time: "정규직",
  temporary: "단기",
  contract: "계약직",
};

export const PAY_UNIT_LABELS: Record<PayUnit, string> = {
  hour: "시급",
  day: "일급",
  week: "주급",
  month: "월급",
  year: "연봉",
};

export const LANGUAGE_REQUIREMENT_LABELS: Record<LanguageRequirement, string> = {
  korean_required: "한국어 필수 (고객 응대)",
  korean_helpful: "한국어 가능 우대",
  bilingual_preferred: "한/영 이중언어 우대",
  english_required: "영어 필수",
};

export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  restaurant_cafe: "식당 / 카페",
  medical_dental_reception: "병원 / 치과 리셉션",
  logistics_warehouse: "물류 / 창고 / 무역",
  beauty_nail_hair: "뷰티 / 네일 / 헤어",
  education_tutoring: "학원 / 튜터링",
  retail: "리테일 / 판매",
  office_admin: "사무 / 관리",
  other: "기타",
};

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  draft: "작성 중",
  pending: "검수 대기",
  approved: "게시됨",
  rejected: "반려됨",
  paused: "일시중지",
  expired: "마감",
};

export const BOOST_LABELS: Record<BoostType, string> = {
  featured: "추천",
  urgent: "급구",
};

/** Format a pay range, e.g. "시급 $18–22" or "연봉 $55,000–65,000". */
export function formatPayRange(
  payMin: number,
  payMax: number,
  payUnit: PayUnit,
): string {
  const unit = PAY_UNIT_LABELS[payUnit];
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const range = payMin === payMax ? fmt(payMin) : `${fmt(payMin)}–${fmt(payMax)}`;
  return `${unit} ${range}`;
}
