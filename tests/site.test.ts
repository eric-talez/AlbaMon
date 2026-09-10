import { afterEach, describe, it, expect, vi } from "vitest";
import {
  getSiteUrl,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  LAUNCH_MARKET,
} from "@/lib/site";

describe("site config", () => {
  it("uses the K-Work US brand", () => {
    expect(SITE_NAME).toBe("K-Work US");
  });

  it("never exposes a forbidden/confusable brand name in UI config", () => {
    const forbidden = [
      ["alba", "mon"].join(""),
      ["알바", "몬"].join(""),
    ];
    const configStrings = [
      SITE_NAME,
      SITE_TAGLINE,
      SITE_DESCRIPTION,
      LAUNCH_MARKET,
    ];
    for (const value of configStrings) {
      const lower = value.toLowerCase();
      for (const bad of forbidden) {
        expect(lower).not.toContain(bad);
      }
    }
  });

  it("launches publicly across California", () => {
    expect(LAUNCH_MARKET).toBe("California");
  });
});

describe("site URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to localhost when NEXT_PUBLIC_SITE_URL is unset or invalid", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getSiteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("normalizes a configured value to its origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beta.example.org/");
    expect(getSiteUrl()).toBe("https://beta.example.org");
  });
});
