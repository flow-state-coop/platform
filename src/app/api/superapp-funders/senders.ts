import { type Address, isAddress, pad, toEventSelector } from "viem";
import { networks } from "@/lib/networks";

const FLOW_UPDATED_TOPIC = toEventSelector(
  "FlowUpdated(address,address,address,int96,int256,int256,bytes)",
);

type ExplorerLog = { topics: (string | null)[] };

export function parseFlowUpdatedSenders(logs: ExplorerLog[]): string[] {
  const senders = new Set<string>();

  for (const log of logs) {
    const sender = log.topics[2];

    if (sender && sender.length === 66) {
      senders.add(`0x${sender.slice(26)}`.toLowerCase());
    }
  }

  return Array.from(senders);
}

// Every address that ever opened a stream into the splitter, read from the
// CFA's FlowUpdated logs on the chain's explorer. The Superfluid subgraph can
// silently drop these events, and public RPCs cap eth_getLogs ranges too
// tightly to scan a round's history, so the explorer is the only cheap
// complete source. Callers still verify each sender's flow rate on-chain.
export async function fetchSplitterSenders(
  chainId: number,
  splitterAddress: string,
  tokenAddress: string,
): Promise<string[]> {
  const explorerApi = networks.find((n) => n.id === chainId)?.explorerApi;

  if (
    !explorerApi ||
    !isAddress(splitterAddress, { strict: false }) ||
    !isAddress(tokenAddress, { strict: false })
  ) {
    return [];
  }

  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: "0",
    toBlock: "latest",
    topic0: FLOW_UPDATED_TOPIC,
    topic1: pad(tokenAddress as Address),
    topic3: pad(splitterAddress as Address),
    topic0_1_opr: "and",
    topic0_3_opr: "and",
    topic1_3_opr: "and",
  });

  try {
    const res = await fetch(`${explorerApi}?${params}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return [];
    }

    const { result } = (await res.json()) as { result?: unknown };

    return Array.isArray(result)
      ? parseFlowUpdatedSenders(result as ExplorerLog[])
      : [];
  } catch {
    return [];
  }
}
