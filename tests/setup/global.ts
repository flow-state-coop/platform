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

  // Neon computes auto-suspend when idle; Prisma's default connect timeout can
  // fire before a cold compute finishes booting. Ensure connect_timeout is
  // generous enough to ride out the wake.
  const migrateUrl = withConnectTimeout(testUrl, 30);

  // prisma.config.ts reads COUNCIL_DATABASE_URL — override it (not DATABASE_URL)
  // so `migrate deploy` targets the test branch, not production.
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    timeout: 60_000,
    env: { ...process.env, COUNCIL_DATABASE_URL: migrateUrl },
  });
}

function withConnectTimeout(urlString: string, seconds: number): string {
  const url = new URL(urlString);
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", String(seconds));
  }
  return url.toString();
}
