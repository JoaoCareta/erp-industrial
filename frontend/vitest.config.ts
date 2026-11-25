import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    reporters: ["default", "junit"],
    outputFile: { junit: "../reports/ui.xml" },
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.tsx"],
      reporter: ["lcov", "text", "json-summary"],
    },
  },
});
