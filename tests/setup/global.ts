import { execSync } from "node:child_process";
import { config } from "dotenv";
import { fileURLToPath, URL } from "node:url";

export default async function globalSetup() {
  config({
    path: fileURLToPath(new URL("../../.env.test.local", import.meta.url)),
    quiet: true,
  });

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set — put it in .env.test.local at the repo root",
    );
  }

  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
