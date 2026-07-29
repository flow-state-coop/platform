import type { Page } from "@playwright/test";
import { networks } from "@/lib/networks";
import { TEST_CHAIN_ID } from "./mockEthereum";

// Every `view` call the pages under test make returns a bool or a small number,
// so one zero word answers all of them: no admin, not transferable, zero units.
const ZERO_WORD = `0x${"0".repeat(64)}`;

type JsonRpcRequest = { id: number; method: string };

function answer(request: JsonRpcRequest) {
  return {
    jsonrpc: "2.0",
    id: request.id,
    result:
      request.method === "eth_chainId"
        ? `0x${TEST_CHAIN_ID.toString(16)}`
        : request.method === "eth_blockNumber"
          ? "0x1"
          : ZERO_WORD,
  };
}

/**
 * Answers the chain reads wagmi makes through its HTTP transport, which the
 * injected wallet mock never sees. Without it a page with a `useReadContract`
 * reaches a public RPC, which is slow and can fail for reasons unrelated to the
 * test.
 */
export async function installRpcMock(page: Page): Promise<void> {
  const rpcHost = new URL(
    networks.find((network) => network.id === TEST_CHAIN_ID)!.rpcUrl,
  ).host;

  await page.route(
    (url) => url.host === rpcHost,
    async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(payload) ? payload.map(answer) : answer(payload),
        ),
      });
    },
  );

  // ENS is one of several fallbacks for the name columns and never the one
  // under test, so failing it fast keeps the run off the network without
  // teaching this mock the universal resolver's ABI.
  await page.route(
    (url) => url.host === "ethereum-rpc.publicnode.com",
    (route) => route.abort(),
  );
}
