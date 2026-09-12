import { describe, it, expect } from "vitest";
import {
  UNKNOWN_IP,
  normalizeClientIp,
  selectClientIp,
} from "@/lib/rate-limit/client-ip";

function makeGet(headers: Record<string, string>) {
  return (name: string): string | null => headers[name] ?? null;
}

describe("normalizeClientIp", () => {
  it("passes through a valid IPv4", () => {
    expect(normalizeClientIp("203.0.113.9")).toBe("203.0.113.9");
  });

  it("strips a port from IPv4", () => {
    expect(normalizeClientIp("203.0.113.9:54321")).toBe("203.0.113.9");
  });

  it("passes through and lowercases IPv6", () => {
    expect(normalizeClientIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normalizeClientIp("::1")).toBe("::1");
  });

  it("strips brackets and an optional port from IPv6", () => {
    expect(normalizeClientIp("[::1]")).toBe("::1");
    expect(normalizeClientIp("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("accepts IPv4-mapped IPv6 (multi-colon, not treated as a port)", () => {
    expect(normalizeClientIp("::ffff:203.0.113.9")).toBe("::ffff:203.0.113.9");
  });

  it("returns unknown for a hostname", () => {
    expect(normalizeClientIp("example.com")).toBe(UNKNOWN_IP);
  });

  it("returns unknown for a zone-suffixed address", () => {
    expect(normalizeClientIp("fe80::1%eth0")).toBe(UNKNOWN_IP);
  });

  it("returns unknown for empty / whitespace", () => {
    expect(normalizeClientIp("")).toBe(UNKNOWN_IP);
    expect(normalizeClientIp("   ")).toBe(UNKNOWN_IP);
  });

  it("returns unknown for out-of-range and malformed octets", () => {
    expect(normalizeClientIp("999.999.999.999")).toBe(UNKNOWN_IP);
    expect(normalizeClientIp("garbage")).toBe(UNKNOWN_IP);
  });

  it("returns unknown for oversized input", () => {
    expect(normalizeClientIp("a".repeat(300))).toBe(UNKNOWN_IP);
  });
});

describe("selectClientIp", () => {
  const VALID = { "x-forwarded-for": "203.0.113.9" };

  it("trusts NOTHING when not on Vercel, even with valid headers", () => {
    expect(selectClientIp(makeGet(VALID), { isVercel: false })).toBe(UNKNOWN_IP);
    expect(
      selectClientIp(makeGet({ "x-real-ip": "203.0.113.9" }), { isVercel: false }),
    ).toBe(UNKNOWN_IP);
  });

  it("ignores a spoofed forwarded header when VERCEL is absent", () => {
    // Attacker-supplied XFF must not be trusted off-platform.
    expect(
      selectClientIp(makeGet({ "x-forwarded-for": "1.2.3.4" }), { isVercel: false }),
    ).toBe(UNKNOWN_IP);
  });

  it("prefers x-vercel-forwarded-for over x-forwarded-for and x-real-ip", () => {
    const ip = selectClientIp(
      makeGet({
        "x-vercel-forwarded-for": "198.51.100.7",
        "x-forwarded-for": "203.0.113.9",
        "x-real-ip": "192.0.2.1",
      }),
      { isVercel: true },
    );
    expect(ip).toBe("198.51.100.7");
  });

  it("falls back to x-forwarded-for then x-real-ip", () => {
    expect(
      selectClientIp(makeGet({ "x-forwarded-for": "203.0.113.9" }), { isVercel: true }),
    ).toBe("203.0.113.9");
    expect(
      selectClientIp(makeGet({ "x-real-ip": "192.0.2.1" }), { isVercel: true }),
    ).toBe("192.0.2.1");
  });

  it("takes the first (client) token of a comma list", () => {
    expect(
      selectClientIp(
        makeGet({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" }),
        { isVercel: true },
      ),
    ).toBe("203.0.113.9");
  });

  it("never returns a malformed token raw; continues to the next header", () => {
    // First header's token is junk -> not used raw; x-real-ip is used instead.
    const ip = selectClientIp(
      makeGet({ "x-forwarded-for": "garbage", "x-real-ip": "192.0.2.1" }),
      { isVercel: true },
    );
    expect(ip).toBe("192.0.2.1");
  });

  it("returns unknown when every trusted header is missing or malformed", () => {
    expect(selectClientIp(makeGet({}), { isVercel: true })).toBe(UNKNOWN_IP);
    expect(
      selectClientIp(makeGet({ "x-forwarded-for": "not-an-ip" }), { isVercel: true }),
    ).toBe(UNKNOWN_IP);
  });
});
