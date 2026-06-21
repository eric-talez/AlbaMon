import { describe, it, expect } from "vitest";
import {
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  LAUNCH_MARKET,
  LAUNCH_CITIES,
} from "@/lib/site";

describe("site config", () => {
  it("uses the K-Work US brand", () => {
    expect(SITE_NAME).toBe("K-Work US");
  });

  it("never exposes a forbidden/confusable brand name in UI config", () => {
    const forbidden = ["albamon", "알바몬"];
    const configStrings = [
      SITE_NAME,
      SITE_TAGLINE,
      SITE_DESCRIPTION,
      LAUNCH_MARKET,
      ...LAUNCH_CITIES,
    ];
    for (const value of configStrings) {
      const lower = value.toLowerCase();
      for (const bad of forbidden) {
        expect(lower).not.toContain(bad);
      }
    }
  });

  it("seeds LA/OC launch cities", () => {
    expect(LAUNCH_CITIES.length).toBeGreaterThanOrEqual(5);
    expect(LAUNCH_CITIES).toContain("Irvine");
  });
});
