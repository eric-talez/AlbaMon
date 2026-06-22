import { describe, expect, it } from "vitest";
import {
  containsBlockedPostingPhrase,
  parseEmployerCompanyForm,
  parseEmployerJobForm,
} from "@/lib/employer/validation";

function validCompanyForm(): FormData {
  const form = new FormData();
  form.set("name", "K-Work Cafe");
  form.set("description", "LA 지역 카페입니다.");
  form.set("website", "https://example.com");
  form.set("phone", "213-555-0100");
  form.set("city", "Los Angeles");
  form.set("state", "ca");
  form.set("addressDisplay", "Koreatown, Los Angeles");
  return form;
}

function validJobForm(): FormData {
  const form = new FormData();
  form.set("title", "카페 바리스타");
  form.set("category", "restaurant_cafe");
  form.set("jobType", "part_time");
  form.set("city", "Los Angeles");
  form.set("state", "ca");
  form.set("addressDisplayMode", "city_only");
  form.set("addressDisplay", "ignored exact address");
  form.set("payMin", "20.50");
  form.set("payMax", "24");
  form.set("payUnit", "hour");
  form.set("tipsAvailable", "on");
  form.set("scheduleDays", "월–금");
  form.set("scheduleTimeRange", "09:00–17:00");
  form.set("languageRequirement", "korean_helpful");
  form.set("description", "고객 응대와 음료 제조 업무입니다.");
  form.set("responsibilities", "음료 제조\n고객 응대\n");
  form.set("requirements", "친절한 서비스");
  form.set("benefits", "식사 제공");
  return form;
}

describe("company form validation", () => {
  it("normalizes state and optional values", () => {
    const result = parseEmployerCompanyForm(validCompanyForm());
    expect(result).toEqual({
      ok: true,
      value: {
        name: "K-Work Cafe",
        description: "LA 지역 카페입니다.",
        website: "https://example.com",
        phone: "213-555-0100",
        city: "Los Angeles",
        state: "CA",
        addressDisplay: "Koreatown, Los Angeles",
      },
    });
  });

  it("rejects missing required fields and unsafe website protocols", () => {
    const missing = validCompanyForm();
    missing.set("name", " ");
    expect(parseEmployerCompanyForm(missing).ok).toBe(false);

    const unsafe = validCompanyForm();
    unsafe.set("website", "javascript:alert(1)");
    expect(parseEmployerCompanyForm(unsafe)).toMatchObject({ ok: false });
  });
});

describe("job form validation", () => {
  it("maps enums, pay, lists, tips, and city-only address safely", () => {
    const result = parseEmployerJobForm(validJobForm());
    expect(result).toMatchObject({
      ok: true,
      value: {
        category: "restaurant_cafe",
        jobType: "part_time",
        state: "CA",
        addressDisplay: "Los Angeles, CA",
        addressDisplayMode: "city_only",
        payMin: 20.5,
        payMax: 24,
        tipsAvailable: true,
        responsibilities: ["음료 제조", "고객 응대"],
      },
    });
  });

  it("requires a display address for full-address mode", () => {
    const form = validJobForm();
    form.set("addressDisplayMode", "full");
    form.set("addressDisplay", "");
    expect(parseEmployerJobForm(form)).toMatchObject({ ok: false });
  });

  it("rejects invalid enums, pay ordering, precision, and oversized lists", () => {
    const invalidEnum = validJobForm();
    invalidEnum.set("category", "forged");
    expect(parseEmployerJobForm(invalidEnum).ok).toBe(false);

    const reversedPay = validJobForm();
    reversedPay.set("payMin", "30");
    reversedPay.set("payMax", "20");
    expect(parseEmployerJobForm(reversedPay).ok).toBe(false);

    const precision = validJobForm();
    precision.set("payMin", "20.123");
    expect(parseEmployerJobForm(precision).ok).toBe(false);

    const tooMany = validJobForm();
    tooMany.set("benefits", Array.from({ length: 21 }, (_, i) => `item ${i}`).join("\n"));
    expect(parseEmployerJobForm(tooMany).ok).toBe(false);
  });

  it.each([
    "Korean-only applicants",
    "한국인만 지원 가능",
    "OPT preferred",
    "H-1B preferred",
    "pay under the table",
    "cash only no tax",
    "세금 없이 현금 지급",
  ])("blocks documented unsafe wording: %s", (phrase) => {
    expect(containsBlockedPostingPhrase(phrase)).toBe(true);
    const form = validJobForm();
    form.set("description", phrase);
    expect(parseEmployerJobForm(form)).toMatchObject({ ok: false });
  });

  it("allows job-related Korean language requirements", () => {
    expect(
      containsBlockedPostingPhrase("Korean required for customer communication"),
    ).toBe(false);
    const form = validJobForm();
    form.set("description", "고객 응대를 위해 한국어가 필요합니다.");
    expect(parseEmployerJobForm(form).ok).toBe(true);
  });
});
