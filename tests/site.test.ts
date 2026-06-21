import { describe, it, expect } from "vitest";
import { SITE_NAME, LAUNCH_CITIES } from "@/lib/site";

describe("site config", () => {
  it("uses the K-Work US brand and avoids forbidden brand names", () => {
    expect(SITE_NAME).toBe("K-Work US");
    expect(SITE_NAME.toLowerCase()).not.toContain("albamon");
    expect(SITE_NAME.toLowerCase()).not.toContain("알바몬");
  });

  it("seeds LA/OC launch cities", () => {
    expect(LAUNCH_CITIES.length).toBeGreaterThanOrEqual(5);
    expect(LAUNCH_CITIES).toContain("Irvine");
  });
});
