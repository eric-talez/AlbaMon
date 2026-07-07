import type { ValidationResult } from "@/lib/employer/validation";

/**
 * Form parsing for the employer access request (Slice 21). Field limits mirror
 * the CHECK constraints in supabase/migrations/20260706000000_employer_access_requests.sql
 * so a form that passes here is also accepted by the database.
 */
export interface EmployerAccessRequestInput {
  businessName: string;
  contactName: string;
  phone: string | null;
  website: string | null;
  city: string;
  state: string;
  reason: string | null;
}

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

export function parseEmployerAccessRequestForm(
  formData: FormData,
): ValidationResult<EmployerAccessRequestInput> {
  const businessName = requiredText(formData, "businessName", "업체명", 200);
  if (!businessName.ok) return businessName;
  const contactName = requiredText(formData, "contactName", "담당자 이름", 120);
  if (!contactName.ok) return contactName;
  const phone = optionalText(formData, "phone", "전화번호", 40);
  if (!phone.ok) return phone;
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
  const city = requiredText(formData, "city", "도시", 100);
  if (!city.ok) return city;
  const state = stringValue(formData, "state")?.toUpperCase();
  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return { ok: false, message: "주(State)는 두 글자 약어로 입력해 주세요." };
  }
  const reason = optionalText(formData, "reason", "요청 사유", 1_000);
  if (!reason.ok) return reason;

  return {
    ok: true,
    value: {
      businessName: businessName.value,
      contactName: contactName.value,
      phone: phone.value,
      website: website.value,
      city: city.value,
      state,
      reason: reason.value,
    },
  };
}
