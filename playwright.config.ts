import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  // Generous enough for the reload-and-retry fallbacks in the auth helpers,
  // which can legitimately spend 30s+ before succeeding on a loaded runner.
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./tests/e2e/setup/global.ts",
  globalTeardown: "./tests/e2e/setup/teardown.ts",
});
