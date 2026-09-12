import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseHmacSecret, computeSubjectHash } from "@/lib/rate-limit/key-core";

// A valid 64-hex-char secret and its uppercase twin.
const HEX_LOWER =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const HEX_UPPER = HEX_LOWER.toUpperCase();

describe("parseHmacSecret", () => {
  it("accepts exactly 64 hex chars and decodes to a 32-byte key", () => {
    const key = parseHmacSecret(HEX_LOWER);
    expect(key).not.toBeNull();
    expect(key).toBeInstanceOf(Buffer);
    expect(key?.length).toBe(32);
  });

  it("is case-insensitive: upper/lower hex decode to the same key", () => {
    const lower = parseHmacSecret(HEX_LOWER);
    const upper = parseHmacSecret(HEX_UPPER);
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(Buffer.compare(lower as Buffer, upper as Buffer)).toBe(0);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(parseHmacSecret(`  ${HEX_LOWER}\n`)?.length).toBe(32);
  });

  it("rejects 63 and 65 hex chars", () => {
    expect(parseHmacSecret(HEX_LOWER.slice(0, 63))).toBeNull();
    expect(parseHmacSecret(HEX_LOWER + "a")).toBeNull();
  });

  it("rejects non-hex characters", () => {
    // 64 chars but with a 'g'.
    const nonHex = "g".repeat(64);
    expect(parseHmacSecret(nonHex)).toBeNull();
  });

  it("rejects empty, whitespace, undefined, and null", () => {
    expect(parseHmacSecret("")).toBeNull();
    expect(parseHmacSecret("   ")).toBeNull();
    expect(parseHmacSecret(undefined)).toBeNull();
    expect(parseHmacSecret(null)).toBeNull();
  });

  it("rejects the shipped .env.example placeholder", () => {
    expect(parseHmacSecret("generate-with-openssl-rand-hex-32")).toBeNull();
  });
});

describe("computeSubjectHash", () => {
  const key = parseHmacSecret(HEX_LOWER) as Buffer;

  it("produces a lowercase 64-hex digest", () => {
    const hash = computeSubjectHash(key, "phone", "+12135550100");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same key/domain/value", () => {
    const a = computeSubjectHash(key, "user", "abc");
    const b = computeSubjectHash(key, "user", "abc");
    expect(a).toBe(b);
  });

  it("separates domains: same value under different domains differs", () => {
    const asPhone = computeSubjectHash(key, "phone", "12345");
    const asIp = computeSubjectHash(key, "ip", "12345");
    const asUser = computeSubjectHash(key, "user", "12345");
    expect(new Set([asPhone, asIp, asUser]).size).toBe(3);
  });

  it("keys the HMAC with the DECODED 32 bytes, not the hex string's UTF-8", () => {
    const viaDecodedKey = computeSubjectHash(key, "phone", "x");
    const viaHexStringKey = createHmac("sha256", HEX_LOWER)
      .update("phone:x")
      .digest("hex");
    expect(viaDecodedKey).not.toBe(viaHexStringKey);
    // Sanity: it does equal an HMAC over the same decoded key + framed message.
    const expected = createHmac("sha256", key).update("phone:x").digest("hex");
    expect(viaDecodedKey).toBe(expected);
  });
});
