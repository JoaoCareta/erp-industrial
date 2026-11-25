import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"], ["junit"]],
  use: {
    baseURL: process.env.WEB_ORIGIN || "http://localhost:18081",
    trace: "retain-on-failure",
  },
});
