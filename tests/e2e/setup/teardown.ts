import { rmSync } from "node:fs";
import { teardownE2eDb } from "../helpers/e2eDb";
import { FIXTURE_FILE } from "./fixtureFile";

export default async function globalTeardown() {
  // Env was loaded by globalSetup; teardown shares the same Node process.
  try {
    await teardownE2eDb();
  } finally {
    rmSync(FIXTURE_FILE, { force: true });
  }
}
