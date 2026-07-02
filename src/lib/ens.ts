import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// Shared mainnet client for ENS lookups. Batching coalesces the per-name
// getEnsAddress/getEnsName calls into few RPC requests when resolving a list.
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", {
    batch: {
      batchSize: 100,
      wait: 10,
    },
  }),
});

export type EnsResolutionResult = {
  // name(lowercased) -> address, only for names that resolved to an address.
  resolved: Record<string, Address>;
  // Names whose lookup threw (RPC/timeout/resolver error), as opposed to cleanly
  // returning "no address". Kept distinct from unregistered names so callers can
  // offer a retry instead of silently dropping a name that would have resolved.
  failed: string[];
};

/**
 * Resolve ENS names to addresses. `resolved` is keyed by the lowercased input
 * name; a name that is malformed or has no address record is simply omitted,
 * while a name whose lookup errored (a transient network failure) is reported in
 * `failed` so the caller can distinguish "doesn't exist" from "couldn't check".
 */
export async function resolveEnsNames(
  names: string[],
): Promise<EnsResolutionResult> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const resolved: Record<string, Address> = {};
  const failed: string[] = [];

  await Promise.all(
    unique.map(async (name) => {
      let normalized: string;

      try {
        normalized = normalize(name);
      } catch {
        // Malformed name: permanently unresolvable, not a transient failure.
        return;
      }

      try {
        const address = await mainnetClient.getEnsAddress({ name: normalized });

        if (address) {
          resolved[name.toLowerCase()] = address;
        }
      } catch {
        failed.push(name);
      }
    }),
  );

  return { resolved, failed };
}
