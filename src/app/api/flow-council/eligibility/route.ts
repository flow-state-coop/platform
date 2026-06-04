import {
  Address,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { db } from "../db";
import { findRoundByCouncil } from "../auth";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks, getViemChain } from "@/lib/networks";
import { GOODDOLLAR_IDENTITY_ADDRESS } from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const IDENTITY_ABI = [
  {
    type: "function",
    name: "isWhitelisted",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
] as const;

type GoodDollarGroup = { id: number; defaultVotingPower: number };

/**
 * Resolve the "gooddollar"-eligibility voter group for a council, if one
 * exists. Queried directly with no in-memory cache: it is a single indexed read
 * on a small table, and a process-local TTL cache went stale for up to a minute
 * after an admin changed a group's eligibility method or default allocation
 * (and wouldn't have been shared across serverless instances regardless).
 */
async function getGoodDollarGroup(
  roundId: number,
): Promise<GoodDollarGroup | null> {
  const group = await db
    .selectFrom("voterGroups")
    .select(["id", "defaultVotingPower"])
    .where("roundId", "=", roundId)
    .where("eligibilityMethod", "=", "gooddollar")
    .orderBy("id", "asc")
    .executeTakeFirst();

  return group
    ? { id: group.id, defaultVotingPower: group.defaultVotingPower }
    : null;
}

export async function POST(request: Request) {
  // Self-claim is gated per council: a request only succeeds when the council
  // has a "gooddollar" voter group (getGoodDollarGroup below) and the bot holds
  // VOTER_MANAGER_ROLE (else addVoter reverts). Revoking that role is the kill
  // switch.
  try {
    const { address, chainId, councilId } = await request.json();

    if (!address || !chainId || !councilId) {
      return Response.json({ success: false, error: "Invalid request" });
    }

    // Validate both as real addresses before they reach a viem contract call or
    // a DB insert — a non-address string would otherwise be written verbatim
    // into voter_group_members (VARCHAR(42) accepts any short string).
    if (!isAddress(address) || !isAddress(councilId)) {
      return Response.json({ success: false, error: "Invalid address" });
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return Response.json({ success: false, error: "Wrong network" });
    }

    const round = await findRoundByCouncil(chainId, councilId);

    if (!round) {
      return Response.json({ success: false, error: "Council not found" });
    }

    const goodDollarGroup = await getGoodDollarGroup(round.id);

    if (!goodDollarGroup) {
      return Response.json({
        success: false,
        error: "GoodDollar eligibility is not enabled for this council",
      });
    }

    const celoNetwork = networks.find((network) => network.id === 42220);
    if (!celoNetwork) {
      return Response.json({ success: false, error: "Celo network missing" });
    }
    const celoPublicClient = createPublicClient({
      chain: getViemChain(celoNetwork.id),
      transport: http(celoNetwork.rpcUrl),
    });

    const isWhitelisted = await celoPublicClient.readContract({
      address: GOODDOLLAR_IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "isWhitelisted",
      args: [address as Address],
    });

    if (!isWhitelisted) {
      return Response.json({ success: false, error: "Not whitelisted" });
    }

    // Record group membership. The UNIQUE(round_id, address) constraint means
    // an address already in any group on this council yields 0 inserted rows,
    // in which case we skip the onchain addVoter call entirely (single-group
    // membership: the existing group wins).
    const inserted = await db
      .insertInto("voterGroupMembers")
      .values({
        voterGroupId: goodDollarGroup.id,
        roundId: round.id,
        address: (address as string).toLowerCase(),
      })
      .onConflict((oc) => oc.columns(["roundId", "address"]).doNothing())
      .returning(["id"])
      .executeTakeFirst();

    if (!inserted) {
      return Response.json({ success: true });
    }

    const account = privateKeyToAccount(
      process.env.FLOW_STATE_ELIGIBILITY_PK as `0x${string}`,
    );

    const viemChain = getViemChain(network.id);
    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(network.rpcUrl),
    });
    const walletClient = createWalletClient({
      chain: viemChain,
      transport: http(network.rpcUrl),
    });

    try {
      const hash = await walletClient.writeContract({
        account,
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "addVoter",
        args: [address as Address, BigInt(goodDollarGroup.defaultVotingPower)],
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });
    } catch (err) {
      const errorMessage =
        (err as Error)?.message ?? "There was an error, please try again later";

      // Already added onchain: the membership row is recorded, treat as success.
      if (errorMessage.includes("ALREADY_ADDED")) {
        return Response.json({ success: true });
      }

      // Roll back the membership row so a retry can re-attempt the onchain call.
      // Guard the rollback itself: if it throws, log it but still surface the
      // original onchain error below, rather than letting the rollback failure
      // propagate to the outer catch (which would lose the onchain error).
      try {
        await db
          .deleteFrom("voterGroupMembers")
          .where("id", "=", inserted.id)
          .execute();
      } catch (rollbackErr) {
        console.error("Failed to roll back voter membership row:", rollbackErr);
      }

      // Log the raw error server-side only — RPC/contract errors can embed
      // provider URLs, contract addresses, or revert data, so never return the
      // message to the client.
      console.error(err);

      return Response.json({
        success: false,
        error: "There was an error, please try again later",
      });
    }

    return Response.json({ success: true });
  } catch (err) {
    // Only errors before the onchain call reach here (JSON parse, address
    // validation, DB queries) — none produce ALREADY_ADDED, which the inner
    // catch around writeContract handles.
    console.error(err);

    return Response.json({
      success: false,
      error: "There was an error, please try again later",
    });
  }
}
