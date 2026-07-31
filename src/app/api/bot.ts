import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getViemChain } from "@/lib/networks";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";
import type { Network } from "@/types/network";
import { withChainSend } from "./botLock";

/**
 * A production RPC can be pointed at a chain without a code change: a service
 * signing real transactions should not depend on load-balanced public
 * endpoints, whose gas-estimation caps also bound how large a batch can be.
 */
function botRpcUrl(network: Network): string {
  return process.env[`RPC_URL_${network.id}`] || network.rpcUrl;
}

/**
 * Build the viem account + clients that sign on-chain actions as the Flow State
 * bot. Single seam for the wallet model: today one centralized key signs for
 * every council; a future per-council HD wallet would be derived here from the
 * network/round instead. Callers on a hot path memoize the result per chain.
 */
export function buildBotSigner(network: Network) {
  const pk = process.env.FLOW_STATE_ELIGIBILITY_PK;
  if (!pk) {
    throw new Error("FLOW_STATE_ELIGIBILITY_PK is not configured");
  }
  // Deliberately no viem nonceManager: it consumes a nonce before the send and
  // never returns it, so one rejected broadcast gaps every later transaction
  // from this key, across every route sharing it. Nonces are instead assigned
  // under a per-chain lease by sendBotTransaction, which reuses a nonce on a
  // failed broadcast rather than burning it.
  const account = privateKeyToAccount(pk as `0x${string}`);

  // On-chain role grants point at FLOW_STATE_BOT_ADDRESS while transactions
  // are signed by this key, so drift between them (a key rotation without a
  // constant update) silently breaks every automated claim. Integration tests
  // run a throwaway key by design, so they are the one environment where the
  // identity check must not run.
  if (
    process.env.NODE_ENV !== "test" &&
    account.address.toLowerCase() !== FLOW_STATE_BOT_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      "FLOW_STATE_ELIGIBILITY_PK does not derive FLOW_STATE_BOT_ADDRESS",
    );
  }
  const viemChain = getViemChain(network.id);
  const rpcUrl = botRpcUrl(network);
  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    chain: viemChain,
    transport: http(rpcUrl),
  });
  return { account, publicClient, walletClient };
}

const signerCache = new Map<number, ReturnType<typeof buildBotSigner>>();

/** The bot signer for a network, memoized per chain. */
export function getBotSigner(network: Network) {
  const cached = signerCache.get(network.id);
  if (cached) return cached;

  const signer = buildBotSigner(network);
  signerCache.set(network.id, signer);
  return signer;
}

/**
 * Run one broadcast from the shared bot key under the chain's send lease, with
 * an explicitly resolved nonce.
 *
 * `broadcast` receives the nonce and must pass it to the viem call, then return
 * without waiting for a receipt — confirmation happens after the lease is
 * released, so a slow chain never blocks another route's send. Every path that
 * signs with this key must go through here: two sends resolving their own nonce
 * from a load-balanced RPC can be handed the same number.
 */
export function sendBotTransaction<T>(
  network: Network,
  broadcast: (nonce: number) => Promise<T>,
): Promise<T> {
  const { account, publicClient } = getBotSigner(network);
  return withChainSend(
    network.id,
    () =>
      publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      }),
    broadcast,
  );
}
