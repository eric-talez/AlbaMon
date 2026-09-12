import { expect, test } from "vitest";
import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { disposePrivateExport } from "./fixtures/dispose-private-export";

test("failed database cleanup preserves its error and disposes the protected export", async () => {
  const folder = await mkdtemp(join(tmpdir(), "d2-disposal-"));
  const failure = new Error("Original database cleanup failure");
  try {
    await writeFile(join(folder, "toy.json"), "{}", { mode: 0o600 });
    await expect(disposePrivateExport(folder, async () => { throw failure; })).rejects.toBe(failure);
    await expect(stat(folder)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
