import {
  Address,
  PublicClient,
  createPublicClient,
  http,
  zeroAddress,
} from "viem";
import {
  CELO_CHAIN_ID,
  GOODDOLLAR_IDENTITY_ABI,
  GOODDOLLAR_IDENTITY_ADDRESS,
} from "@/app/flow-councils/lib/constants";
import { networks, getViemChain } from "@/lib/networks";

// Addresses per multicall when resolving a batch. A manual add accepts
// thousands of addresses, which is far more than one eth_call can carry.
const ROOT_LOOKUP_BATCH = 250;

export function createCeloIdentityClient(): PublicClient | null {
  const celoNetwork = networks.find((network) => network.id === CELO_CHAIN_ID);

  if (!celoNetwork) {
    return null;
  }

  return createPublicClient({
    chain: getViemChain(celoNetwork.id),
    transport: http(celoNetwork.rpcUrl),
  }) as PublicClient;
}

/**
 * Resolves a wallet to the GoodDollar identity that verified it, or null when
 * there is none.
 *
 * A GoodDollar identity is anchored to a single address, the root. Wallets its
 * holder connects to that identity answer false to isWhitelisted, so checking
 * the connected wallet directly turns verified people away. getWhitelistedRoot
 * maps either kind of wallet back to the root (itself, for a root) and answers
 * the zero address when the wallet belongs to no verified identity, which is
 * how GoodDollar's own citizen-sdk reads verification.
 *
 * Callers must treat the returned root as the identity key, never as the voter:
 * voting power belongs on the wallet that signs, and every root resolves from
 * an unbounded number of connected wallets.
 */
export async function resolveVerifiedRoot(
  client: PublicClient,
  address: Address,
): Promise<Address | null> {
  const root = await client.readContract({
    address: GOODDOLLAR_IDENTITY_ADDRESS,
    abi: GOODDOLLAR_IDENTITY_ABI,
    functionName: "getWhitelistedRoot",
    args: [address],
  });

  return root === zeroAddress ? null : root;
}

/**
 * Batch form of resolveVerifiedRoot, lowercased both ways. Unverified wallets
 * are absent from the map rather than present with a null.
 */
export async function resolveVerifiedRoots(
  client: PublicClient,
  addresses: Address[],
): Promise<Map<string, string>> {
  const roots = new Map<string, string>();

  for (let i = 0; i < addresses.length; i += ROOT_LOOKUP_BATCH) {
    const chunk = addresses.slice(i, i + ROOT_LOOKUP_BATCH);
    const results = await client.multicall({
      contracts: chunk.map((address) => ({
        address: GOODDOLLAR_IDENTITY_ADDRESS,
        abi: GOODDOLLAR_IDENTITY_ABI,
        functionName: "getWhitelistedRoot",
        args: [address],
      })),
      allowFailure: false,
    });

    results.forEach((root, index) => {
      if (root !== zeroAddress) {
        roots.set(chunk[index].toLowerCase(), String(root).toLowerCase());
      }
    });
  }

  return roots;
}
