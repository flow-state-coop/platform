import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

/**
 * Resolve ENS names to addresses. Returns a map keyed by the lowercased input
 * name; names that fail to resolve (malformed, unregistered, no address record)
 * are omitted so callers can treat them as unresolved.
 */
export async function resolveEnsNames(
  names: string[],
): Promise<Record<string, Address>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const resolved: Record<string, Address> = {};

  await Promise.all(
    unique.map(async (name) => {
      try {
        const address = await ensClient.getEnsAddress({
          name: normalize(name),
        });

        if (address) {
          resolved[name.toLowerCase()] = address;
        }
      } catch {
        // Unresolvable / malformed name — left out; the caller skips it.
      }
    }),
  );

  return resolved;
}
