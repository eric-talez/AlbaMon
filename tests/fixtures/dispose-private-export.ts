import { rm } from "node:fs/promises";

export async function disposePrivateExport(folder: string, cleanup: () => Promise<void>) {
  try {
    await cleanup();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
