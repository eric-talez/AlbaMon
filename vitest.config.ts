import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws when imported outside a React Server Component bundle.
// Alias it to an inert stub so server-only modules can be unit-tested in Node.
const serverOnlyStub = fileURLToPath(
  new URL("./tests/stubs/server-only.ts", import.meta.url),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": serverOnlyStub,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: true,
  },
});
