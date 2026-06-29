import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** All git-tracked files (relative paths), excluding deleted entries. */
function trackedFiles(): string[] {
  return execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

function isTextFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|txt|env\.example)$/.test(path);
}

const files = trackedFiles();

describe("no secrets committed", () => {
  it("does not track any real .env file (only .env.example)", () => {
    const envFiles = files.filter((f) => /(^|\/)\.env($|\.)/.test(f));
    expect(envFiles).toEqual([".env.example"]);
  });

  it("contains no real secret material in tracked files", () => {
    const secretPatterns: { name: string; re: RegExp }[] = [
      { name: "stripe-live-key", re: /sk_live_[0-9a-zA-Z]{16,}/ },
      { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
      { name: "private-key-block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
      // JWT-shaped value (e.g. a real Supabase anon/service key).
      { name: "jwt-token", re: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
    ];

    const offenders: string[] = [];
    for (const file of files) {
      if (!isTextFile(file)) continue;
      const content = readFileSync(file, "utf8");
      for (const { name, re } of secretPatterns) {
        if (re.test(content)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it(".env.example ships only placeholders", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).toContain("your-project");
    expect(example).toContain("your-anon-key");
    expect(example).not.toMatch(/sk_live_/);
  });
});

describe("no forbidden brand name in app code", () => {
  const forbidden = [
    ["alba", "mon"].join(""),
    ["알바", "몬"].join(""),
  ];

  it("src/** never exposes forbidden/confusable brand names", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (!file.startsWith("src/")) continue;
      if (!isTextFile(file)) continue;
      const content = readFileSync(file, "utf8").toLowerCase();
      if (forbidden.some((bad) => content.includes(bad))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
