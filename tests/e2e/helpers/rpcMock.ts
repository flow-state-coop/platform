import type { Page } from "@playwright/test";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { networks } from "@/lib/networks";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

// Every `view` call the pages under test make returns a bool or a small number,
// so one zero word is the default answer: no admin, not transferable, zero units.
export const ZERO_WORD = `0x${"0".repeat(64)}` as const;
export const TRUE_WORD = `0x${"0".repeat(63)}1` as const;

const MULTICALL3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

const AGGREGATE3_SELECTOR = "0x82ad56cb";

/**
 * What a single contract read returns, keyed on its calldata. Returning
 * undefined falls through to the zero word, so a test only describes the reads
 * it cares about.
 */
export type AnswerCall = (callData: string) => `0x${string}` | undefined;

/**
 * `isPoolAdmin(poolId, bot)` answers true, every other read stays at zero. The
 * bot's address in the calldata is what identifies the call, which avoids
 * teaching this helper a selector that would drift with the ABI.
 */
export const botHoldsAdmin: AnswerCall = (callData) =>
  callData.toLowerCase().includes(FLOW_STATE_BOT_ADDRESS.toLowerCase().slice(2))
    ? TRUE_WORD
    : undefined;

/**
 * wagmi batches view calls through Multicall3, so most `eth_call`s that reach
 * here are one `aggregate3` wrapping several reads. Answering the aggregate with
 * a bare word cannot decode as its `(bool, bytes)[]` return, which fails every
 * read in the batch at once rather than the one being simulated. Unwrapping it
 * is what lets a test state a value for one read and leave the rest at zero.
 */
function answerCallData(data: string, answer?: AnswerCall): `0x${string}` {
  if (!data.toLowerCase().startsWith(AGGREGATE3_SELECTOR)) {
    return answer?.(data) ?? ZERO_WORD;
  }

  const { args } = decodeFunctionData({
    abi: MULTICALL3_ABI,
    data: data as `0x${string}`,
  });

  return encodeFunctionResult({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    result: args[0].map((call) => ({
      success: true,
      returnData: answer?.(call.callData) ?? ZERO_WORD,
    })),
  });
}

type JsonRpcRequest = { id: number; method: string; params?: unknown[] };

function answer(
  request: JsonRpcRequest,
  chainId: number,
  answerCall?: AnswerCall,
) {
  const data = String(
    (request.params?.[0] as { data?: string } | undefined)?.data ?? "",
  );

  return {
    jsonrpc: "2.0",
    id: request.id,
    result:
      request.method === "eth_chainId"
        ? `0x${chainId.toString(16)}`
        : request.method === "eth_blockNumber"
          ? "0x1"
          : answerCallData(data, answerCall),
  };
}

/**
 * Answers the chain reads wagmi makes through its HTTP transport, which the
 * injected wallet mock never sees. Without it a page with a `useReadContract`
 * reaches a public RPC, which is slow and can fail for reasons unrelated to the
 * test.
 *
 * Every configured chain is answered, not only the one the fixtures live on: a
 * wallet on the wrong network has wagmi reading balances and block numbers
 * against that chain's transport too, and each host reports its own id so the
 * connector does not see a mismatch.
 */
export async function installRpcMock(
  page: Page,
  answerCall?: AnswerCall,
): Promise<void> {
  const chainIdByHost = new Map(
    networks.map((network) => [new URL(network.rpcUrl).host, network.id]),
  );

  await page.route(
    (url) => chainIdByHost.has(url.host),
    async (route) => {
      const chainId = chainIdByHost.get(new URL(route.request().url()).host)!;
      const payload = JSON.parse(route.request().postData() ?? "{}");

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(payload)
            ? payload.map((entry) => answer(entry, chainId, answerCall))
            : answer(payload, chainId, answerCall),
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
