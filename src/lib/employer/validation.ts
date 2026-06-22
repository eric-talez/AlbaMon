import {
  JOB_CATEGORIES,
  JOB_TYPES,
  LANGUAGE_REQUIREMENTS,
  PAY_UNITS,
  type AddressDisplayMode,
  type JobCategory,
  type JobType,
  type LanguageRequirement,
  type PayUnit,
} from "@/lib/types";

export interface EmployerCompanyInput {
  name: string;
  description: string;
  website: string | null;
  phone: string | null;
  city: string;
  state: string;
  addressDisplay: string;
}

export interface EmployerJobInput {
  title: string;
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
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

const BLOCKED_PHRASES = [
  "korean only",
  "koreans only",
  "한국인만",
  "한국 사람만",
  "opt only",
  "opt preferred",
  "h1b preferred",
  "h 1b preferred",
  "visa preferred",
  "비자 우대",
  "under the table",
  "cash only no tax",
  "cash no tax",
  "세금 없이",
  "세금없이",
] as const;

function stringValue(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : null;
}

function requiredText(
  formData: FormData,
  name: string,
  label: string,
  maxLength: number,
): ValidationResult<string> {
  const value = stringValue(formData, name);
  if (!value) return { ok: false, message: `${label}을(를) 입력해 주세요.` };
  if (value.length > maxLength) {
    return { ok: false, message: `${label}은(는) ${maxLength}자 이하로 입력해 주세요.` };
  }
  return { ok: true, value };
}

function optionalText(
  formData: FormData,
  name: string,
  label: string,
  maxLength: number,
): ValidationResult<string | null> {
  const value = stringValue(formData, name);
  if (!value) return { ok: true, value: null };
  if (value.length > maxLength) {
    return { ok: false, message: `${label}은(는) ${maxLength}자 이하로 입력해 주세요.` };
  }
  return { ok: true, value };
}

function enumValue<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  label: string,
): ValidationResult<T> {
  const value = stringValue(formData, name);
  if (!value || !(allowed as readonly string[]).includes(value)) {
    return { ok: false, message: `${label} 선택이 올바르지 않습니다.` };
  }
  return { ok: true, value: value as T };
}

function stateValue(formData: FormData): ValidationResult<string> {
  const state = stringValue(formData, "state")?.toUpperCase();
  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return { ok: false, message: "주(State)는 두 글자 약어로 입력해 주세요." };
  }
  return { ok: true, value: state };
}

function parseMoney(formData: FormData, name: string, label: string): ValidationResult<number> {
  const value = stringValue(formData, name);
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return { ok: false, message: `${label}은(는) 0 이상의 금액으로 입력해 주세요.` };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount > 10_000_000) {
    return { ok: false, message: `${label} 금액이 허용 범위를 벗어났습니다.` };
  }
  return { ok: true, value: amount };
}

function parseList(formData: FormData, name: string, label: string): ValidationResult<string[]> {
  const raw = stringValue(formData, name) ?? "";
  const items = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 20) {
    return { ok: false, message: `${label}은(는) 최대 20개까지 입력할 수 있습니다.` };
  }
  if (items.some((item) => item.length > 300)) {
    return { ok: false, message: `${label}의 각 항목은 300자 이하로 입력해 주세요.` };
  }
  return { ok: true, value: items };
}

function normalizeComplianceText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsBlockedPostingPhrase(value: string): boolean {
  const normalized = normalizeComplianceText(value);
  return BLOCKED_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function parseEmployerCompanyForm(formData: FormData): ValidationResult<EmployerCompanyInput> {
  const name = requiredText(formData, "name", "회사명", 120);
  if (!name.ok) return name;
  const description = requiredText(formData, "description", "회사 소개", 2_000);
  if (!description.ok) return description;
  const website = optionalText(formData, "website", "웹사이트", 2_048);
  if (!website.ok) return website;
  if (website.value) {
    try {
      const url = new URL(website.value);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      return { ok: false, message: "웹사이트는 http 또는 https 주소로 입력해 주세요." };
    }
  }
  const phone = optionalText(formData, "phone", "전화번호", 40);
  if (!phone.ok) return phone;
  const city = requiredText(formData, "city", "도시", 100);
  if (!city.ok) return city;
  const state = stateValue(formData);
  if (!state.ok) return state;
  const addressDisplay = requiredText(formData, "addressDisplay", "표시 주소", 200);
  if (!addressDisplay.ok) return addressDisplay;

  return {
    ok: true,
    value: {
      name: name.value,
      description: description.value,
      website: website.value,
      phone: phone.value,
      city: city.value,
      state: state.value,
      addressDisplay: addressDisplay.value,
    },
  };
}

export function parseEmployerJobForm(formData: FormData): ValidationResult<EmployerJobInput> {
  const title = requiredText(formData, "title", "공고 제목", 120);
  if (!title.ok) return title;
  const category = enumValue(formData, "category", JOB_CATEGORIES, "직종");
  if (!category.ok) return category;
  const jobType = enumValue(formData, "jobType", JOB_TYPES, "고용 형태");
  if (!jobType.ok) return jobType;
  const city = requiredText(formData, "city", "도시", 100);
  if (!city.ok) return city;
  const state = stateValue(formData);
  if (!state.ok) return state;
  const addressDisplayMode = enumValue(
    formData,
    "addressDisplayMode",
    ["full", "city_only"] as const,
    "주소 공개 방식",
  );
  if (!addressDisplayMode.ok) return addressDisplayMode;
  const rawAddress = optionalText(formData, "addressDisplay", "표시 주소", 200);
  if (!rawAddress.ok) return rawAddress;
  if (addressDisplayMode.value === "full" && !rawAddress.value) {
    return { ok: false, message: "전체 주소 공개를 선택한 경우 표시 주소를 입력해 주세요." };
  }
  const payMin = parseMoney(formData, "payMin", "최소 급여");
  if (!payMin.ok) return payMin;
  const payMax = parseMoney(formData, "payMax", "최대 급여");
  if (!payMax.ok) return payMax;
  if (payMax.value < payMin.value) {
    return { ok: false, message: "최대 급여는 최소 급여보다 작을 수 없습니다." };
  }
  const payUnit = enumValue(formData, "payUnit", PAY_UNITS, "급여 단위");
  if (!payUnit.ok) return payUnit;
  const scheduleDays = requiredText(formData, "scheduleDays", "근무 요일", 200);
  if (!scheduleDays.ok) return scheduleDays;
  const scheduleTimeRange = requiredText(formData, "scheduleTimeRange", "근무 시간", 200);
  if (!scheduleTimeRange.ok) return scheduleTimeRange;
  const languageRequirement = enumValue(
    formData,
    "languageRequirement",
    LANGUAGE_REQUIREMENTS,
    "언어 요건",
  );
  if (!languageRequirement.ok) return languageRequirement;
  const description = requiredText(formData, "description", "상세 설명", 5_000);
  if (!description.ok) return description;
  const responsibilities = parseList(formData, "responsibilities", "담당 업무");
  if (!responsibilities.ok) return responsibilities;
  const requirements = parseList(formData, "requirements", "자격 요건");
  if (!requirements.ok) return requirements;
  const benefits = parseList(formData, "benefits", "복리후생");
  if (!benefits.ok) return benefits;

  const complianceText = [
    title.value,
    description.value,
    ...responsibilities.value,
    ...requirements.value,
    ...benefits.value,
  ].join("\n");
  if (containsBlockedPostingPhrase(complianceText)) {
    return {
      ok: false,
      message:
        "차별적 국적 제한, 비자 선호, 또는 세금 회피성 현금 지급 표현을 삭제해 주세요.",
    };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      category: category.value,
      jobType: jobType.value,
      city: city.value,
      state: state.value,
      addressDisplay:
        addressDisplayMode.value === "city_only"
          ? `${city.value}, ${state.value}`
          : (rawAddress.value as string),
      addressDisplayMode: addressDisplayMode.value,
      payMin: payMin.value,
      payMax: payMax.value,
      payUnit: payUnit.value,
      tipsAvailable: formData.get("tipsAvailable") === "on",
      scheduleDays: scheduleDays.value,
      scheduleTimeRange: scheduleTimeRange.value,
      languageRequirement: languageRequirement.value,
      description: description.value,
      responsibilities: responsibilities.value,
      requirements: requirements.value,
      benefits: benefits.value,
    },
  };
}
