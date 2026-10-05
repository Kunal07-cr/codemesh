import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@codemesh/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@codemesh/code-intelligence": new URL("./packages/code-intelligence/src/index.ts", import.meta.url).pathname,
      "@codemesh/ai": new URL("./packages/ai/src/index.ts", import.meta.url).pathname
    }
  }
});
