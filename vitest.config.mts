import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "lib/**/*.test.ts"],
    environment: "node",
  },
});
