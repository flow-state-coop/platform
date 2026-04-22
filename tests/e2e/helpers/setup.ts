import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import {
  buildMockEthereumScript,
  TEST_PRIVATE_KEY,
} from "./mockEthereum";
import { attachSiweSignBridge } from "./siweHelper";
import type { E2eFixture } from "./e2eDb";
import { FIXTURE_FILE } from "../setup/fixtureFile";

export function readFixture(): E2eFixture {
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf-8"));
}

// Installs the mock wallet + Node-side sign bridge. Must run before any
// navigation: the provider script is injected via addInitScript and needs
// __nodeSign to exist at the moment wagmi reads window.ethereum.
export async function installMockWallet(page: Page): Promise<void> {
  await attachSiweSignBridge(page, TEST_PRIVATE_KEY);
  await page.addInitScript({
    content: buildMockEthereumScript(TEST_PRIVATE_KEY),
  });
}
