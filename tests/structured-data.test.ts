import { describe, expect, it, vi } from "vitest";
import { getMockJobs } from "@/lib/mock/jobs";
import { PAY_UNITS } from "@/lib/types";
import { buildJobPosting, serializeJobPosting } from "@/lib/jobs/structured-data";

const job = { ...getMockJobs()[0], postedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" };
describe("truthful JobPosting", () => {
  it("contains complete displayed facts with paragraph formatting and city-only location", () => {
    const data = buildJobPosting(job);
    expect(data).toMatchObject({ "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
      datePosted: job.postedAt, validThrough: job.expiresAt, hiringOrganization: { "@type": "Organization", name: job.companyName },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.city, addressRegion: "CA", addressCountry: "US" } },
      baseSalary: { currency: "USD", value: { minValue: job.payMin, maxValue: job.payMax } } });
    const description = String(data.description);
    for (const fact of [job.description, ...job.responsibilities, ...job.requirements, ...job.benefits, job.scheduleDays, job.scheduleTimeRange]) expect(description).toContain(fact);
    expect(description).toContain("<p>");
    expect(JSON.stringify(data)).not.toMatch(/streetAddress|postalCode|jobLocationType|employmentType|sameAs/);
  });
  it.each(PAY_UNITS)("uses the exact salary unit for %s", (payUnit) => {
    expect(buildJobPosting({ ...job, payUnit }).baseSalary).toMatchObject({ value: { unitText: payUnit.toUpperCase() } });
  });
  it("escapes employer HTML before markup and escapes the separate script boundary", () => {
    const hostile = { ...job, title: '</script><script>alert(1)</script>', description: '<img src=x onerror="bad"> & second\nparagraph' };
    const data = buildJobPosting(hostile);
    expect(data.title).toBe(hostile.title);
    expect(data.description).toContain('&lt;img src=x onerror=&quot;bad&quot;&gt; &amp; second</p><p>paragraph');
    const serialized = serializeJobPosting(data);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(data);
  });
});


vi.mock("@/lib/db/jobs",()=>({getApprovedJobById:vi.fn()}));
import { getApprovedJobById } from "@/lib/db/jobs";
import JobDetailPage from "@/app/(public)/jobs/[id]/page";
import { renderToStaticMarkup } from "react-dom/server";
it("displays the actual locality used by JSON-LD even when a legacy public address is empty", async()=>{
  vi.mocked(getApprovedJobById).mockResolvedValue({...job,city:"Oakland",state:"CA",addressDisplay:"",addressDisplayMode:"full"});
  const html=renderToStaticMarkup(await JobDetailPage({params:Promise.resolve({id:job.id})}));
  expect(html).toContain('<dd class="text-sm">Oakland, CA</dd>');
});

it.each([
  ["2026-01-02T00:30:00Z", "2026. 1. 1. 16:30 PT"],
  ["2026-07-02T00:30:00Z", "2026. 7. 1. 17:30 PT"],
])("displays publication and expiry in California time for %s, retaining ISO attributes", async (iso, visible) => {
  vi.mocked(getApprovedJobById).mockResolvedValue({ ...job, postedAt: iso, expiresAt: iso });
  const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: job.id }) }));
  expect(html.match(/<time\b[^>]*>.*?<\/time>/g)).toEqual([
    `<time dateTime="${iso}">${visible}</time>`,
    `<time dateTime="${iso}">${visible}</time>`,
  ]);
});

it("keeps the honest missing-publication fallback without inventing a date", async () => {
  vi.mocked(getApprovedJobById).mockResolvedValue({ ...job, postedAt: "" });
  const html = renderToStaticMarkup(await JobDetailPage({ params: Promise.resolve({ id: job.id }) }));
  expect(html).toContain('<time dateTime="">기록 없음</time>');
  expect(html).not.toContain('type="application/ld+json"');
});
