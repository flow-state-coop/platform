import { Address, PublicClient, zeroAddress } from "viem";
import {
  GOODDOLLAR_IDENTITY_ABI,
  GOODDOLLAR_IDENTITY_ADDRESS,
} from "@/app/flow-councils/lib/constants";
import { splitIntoChunks } from "@/app/flow-councils/lib/chunkQueue";

// Addresses per multicall when resolving a batch. A manual add accepts
// thousands of addresses, which is far more than one eth_call can carry.
const ROOT_LOOKUP_BATCH = 250;

// Multicalls in flight at once. The batches are independent reads, so awaiting
// them one after another turns a 5000-address add into 20 serial round trips on
// a public RPC; a few at a time keeps that short without hammering the node.
const MAX_CONCURRENT_LOOKUPS = 4;

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
  const batches = splitIntoChunks(addresses, ROOT_LOOKUP_BATCH);

  for (const wave of splitIntoChunks(batches, MAX_CONCURRENT_LOOKUPS)) {
    const waveResults = await Promise.all(
      wave.map((batch) =>
        client.multicall({
          contracts: batch.map((address) => ({
            address: GOODDOLLAR_IDENTITY_ADDRESS,
            abi: GOODDOLLAR_IDENTITY_ABI,
            functionName: "getWhitelistedRoot",
            args: [address],
          })),
          // Fail the whole batch rather than resolve part of it: an unverified
          // wallet answers the zero address instead of reverting, so a failure
          // here is the RPC and not one address, and reading on would hand back
          // a map that silently calls unreadable wallets unverified.
          allowFailure: false,
        }),
      ),
    );

    waveResults.forEach((results, batchIndex) =>
      results.forEach((root, index) => {
        if (root !== zeroAddress) {
          roots.set(
            wave[batchIndex][index].toLowerCase(),
            String(root).toLowerCase(),
          );
        }
      }),
    );
  }

  return roots;
}
