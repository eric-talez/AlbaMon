import { LANGUAGE_REQUIREMENT_LABELS, type Job } from "@/lib/types";

const unitText = { hour: "HOUR", day: "DAY", week: "WEEK", month: "MONTH", year: "YEAR" } as const;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

/** Only facts also displayed on the public detail page. Employer text is plain text. */
export function buildJobPosting(job: Job & { expiresAt: string }): Record<string, unknown> {
  const paragraphs = [job.description, ...job.responsibilities, ...job.requirements, ...job.benefits,
    `근무 요일: ${job.scheduleDays}`, `근무 시간: ${job.scheduleTimeRange}`,
    `언어 요건: ${LANGUAGE_REQUIREMENT_LABELS[job.languageRequirement]}`];
  return {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: paragraphs.flatMap((text) => text.split(/\r?\n/)).filter(Boolean)
      .map((text) => `<p>${escapeHtml(text)}</p>`).join(""),
    datePosted: job.postedAt, validThrough: job.expiresAt,
    hiringOrganization: { "@type": "Organization", name: job.companyName },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress",
      addressLocality: job.city, addressRegion: job.state, addressCountry: "US" } },
    baseSalary: { "@type": "MonetaryAmount", currency: "USD", value: {
      "@type": "QuantitativeValue", minValue: job.payMin, maxValue: job.payMax, unitText: unitText[job.payUnit],
    } },
  };
}

/** Script serialization is a separate boundary from description HTML escaping. */
export function serializeJobPosting(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
