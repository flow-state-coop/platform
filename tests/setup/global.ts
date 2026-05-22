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
  await migrateDeploy({ ...process.env, COUNCIL_DATABASE_URL: migrateUrl });
}

// PR and main runs share one test database, so concurrent `migrate deploy`
// invocations contend on Prisma's migration advisory lock; the loser times out
// after 10s ("P1002 … Timed out trying to acquire a postgres advisory lock").
// Neon can also drop the first connection to a cold compute (P1001). Both are
// transient, so retry with linear backoff before failing. Genuine migration
// errors don't match these patterns and surface on the first attempt.
const TRANSIENT_PATTERNS = [
  "P1002", // server reached but timed out (advisory-lock contention)
  "P1001", // can't reach the database server
  "advisory lock",
  "Timed out",
  "ECONNRESET",
];

async function migrateDeploy(env: NodeJS.ProcessEnv): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stdout = execSync("pnpm prisma migrate deploy", {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: 60_000,
        env,
      });
      process.stdout.write(stdout);
      return;
    } catch (error) {
      const { stdout, stderr, signal } = error as {
        stdout?: string;
        stderr?: string;
        signal?: string;
      };
      const output = `${stdout ?? ""}${stderr ?? ""}`;
      process.stderr.write(output);

      // signal !== null means execSync killed it at the timeout — a stuck/cold
      // compute, also worth retrying.
      const transient =
        signal != null || TRANSIENT_PATTERNS.some((p) => output.includes(p));
      if (!transient || attempt === maxAttempts) {
        throw new Error(
          `prisma migrate deploy failed after ${attempt} attempt(s)`,
        );
      }

      const delayMs = attempt * 5_000;
      console.warn(
        `migrate deploy hit a transient database error (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs / 1000}s`,
      );
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withConnectTimeout(urlString: string, seconds: number): string {
  const url = new URL(urlString);
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", String(seconds));
  }
  return url.toString();
}
