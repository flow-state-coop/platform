import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { seedE2eFixture } from "../helpers/e2eDb";
import { FIXTURE_FILE } from "./fixtureFile";

function loadEnvTestLocal(): void {
  const envPath = path.resolve(__dirname, "../../../.env.test.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

export default async function globalSetup() {
  loadEnvTestLocal();

  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is not set — put it in .env.test.local or CI secrets",
    );
  }

  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error(
      "NEXTAUTH_SECRET is not set — required for SIWE sign-in during E2E",
    );
  }

  const fixture = await seedE2eFixture();
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture), "utf-8");
}
