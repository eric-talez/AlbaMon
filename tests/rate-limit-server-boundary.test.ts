import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The rate limiter's server-only surface must never enter a client bundle.
 * Statically forbid any Client Component (`"use client"`) from importing the
 * secret/service-role/IP modules or the OTP action module. The OTP actions reach
 * the client only via prop-threading from the `AuthCard` Server Component.
 */

const SRC_DIR = join(process.cwd(), "src");

const FORBIDDEN_IMPORTS = [
  "@/lib/rate-limit/keys",
  "@/lib/rate-limit/client-ip",
  "@/lib/rate-limit/service",
  "@/lib/supabase/service",
  "@/lib/auth/otp-actions",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** True only when the first meaningful line is the "use client" directive. */
function isClientModule(content: string): boolean {
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) {
      continue;
    }
    return t === '"use client";' || t === "'use client';";
  }
  return false;
}

describe("rate-limit server-only boundary", () => {
  const files = walk(SRC_DIR);
  const clientModules = files.filter((f) => isClientModule(readFileSync(f, "utf8")));

  it("finds Client Components to check (sanity)", () => {
    expect(clientModules.length).toBeGreaterThan(0);
  });

  it("no Client Component imports a server-only rate-limit / service-role module", () => {
    const offenders: string[] = [];
    for (const file of clientModules) {
      const content = readFileSync(file, "utf8");
      for (const specifier of FORBIDDEN_IMPORTS) {
        if (content.includes(`"${specifier}"`) || content.includes(`'${specifier}'`)) {
          offenders.push(`${file.replace(process.cwd() + "/", "")} → ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
