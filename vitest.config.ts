import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.{ts,tsx}"],
          setupFiles: ["@testing-library/jest-dom/vitest"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.{ts,tsx}"],
          setupFiles: ["./tests/setup/integration-env.ts"],
          globalSetup: ["./tests/setup/global.ts"],
          // Integration tests share a single Neon test branch; run them
          // sequentially to avoid FK races during reset/seed.
          fileParallelism: false,
        },
      },
    ],
  },
});
