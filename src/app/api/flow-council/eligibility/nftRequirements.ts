import type { Address } from "viem";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { erc721MinimalAbi, erc1155MinimalAbi } from "@/lib/abi/nft";
import {
  VOTER_MANAGER_ROLE,
  FLOW_STATE_BOT_ADDRESS,
} from "@/app/flow-councils/lib/constants";
import type { Network } from "@/types/network";
import { getCouncilPublicClient } from "../metrics/lib";

export type NftRequirement = {
  id: number;
  name: string;
  defaultVotingPower: number;
  nftContractAddress: string;
  nftTokenStandard: "erc721" | "erc1155";
  nftTokenId: string | null;
};

export type RequirementStatus = "met" | "unmet" | "unknown";

type RequirementRecord = {
  id: number;
  name: string;
  defaultVotingPower: number;
  nftContractAddress: string | null;
  nftTokenStandard: string | null;
  nftTokenId: string | null;
};

/**
 * Map stored group rows onto the shape the evaluator reads. Shared by the
 * status and claim routes so the popup and the claim can never disagree about
 * which requirements exist or how a row is read.
 */
export function toRequirements(rows: RequirementRecord[]): NftRequirement[] {
  // A row with no contract address can never match anyone, and an empty address
  // would fail the whole multicall rather than one entry. An unrecognized
  // standard is dropped rather than coerced: reading a 1155 with the
  // one-argument balanceOf could report every wallet as a holder.
  return rows
    .filter(
      (row) =>
        !!row.nftContractAddress &&
        (row.nftTokenStandard === "erc721" ||
          row.nftTokenStandard === "erc1155"),
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      defaultVotingPower: row.defaultVotingPower,
      nftContractAddress: row.nftContractAddress as string,
      nftTokenStandard: row.nftTokenStandard as "erc721" | "erc1155",
      nftTokenId: row.nftTokenId,
    }));
}

export type RequirementRow = {
  groupId: number;
  name: string;
  votes: number;
  status: RequirementStatus;
};

export type NftEvaluation = {
  votingPower: bigint | null;
  botHasRole: boolean | null;
  rows: RequirementRow[];
};

type MulticallEntry =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: unknown };

function balanceCall(requirement: NftRequirement, address: Address) {
  const collection = requirement.nftContractAddress as Address;

  return requirement.nftTokenStandard === "erc1155"
    ? {
        address: collection,
        abi: erc1155MinimalAbi,
        functionName: "balanceOf" as const,
        args: [address, BigInt(requirement.nftTokenId ?? "0")] as const,
      }
    : {
        address: collection,
        abi: erc721MinimalAbi,
        functionName: "balanceOf" as const,
        args: [address] as const,
      };
}

function toStatus(entry: MulticallEntry | undefined): RequirementStatus {
  // A read that failed is unresolved, never a denial: presenting it as "you
  // don't qualify" would be a false negative on a wallet that does hold the NFT.
  if (entry?.status !== "success") {
    return "unknown";
  }

  return (entry.result as bigint) > 0n ? "met" : "unmet";
}

/**
 * Resolve, in a single batched request, whether a wallet already has voting
 * power on a council, whether the bot can grant any, and which of the council's
 * NFT requirements the wallet currently meets.
 */
export async function evaluateNftRequirements({
  network,
  councilId,
  address,
  requirements,
}: {
  network: Network;
  councilId: string;
  address: string;
  requirements: NftRequirement[];
}): Promise<NftEvaluation> {
  const client = getCouncilPublicClient(network);
  const council = councilId as Address;
  const holder = address as Address;

  const contracts = [
    {
      address: council,
      abi: flowCouncilAbi,
      functionName: "getVoter" as const,
      args: [holder] as const,
    },
    {
      address: council,
      abi: flowCouncilAbi,
      functionName: "hasRole" as const,
      args: [VOTER_MANAGER_ROLE, FLOW_STATE_BOT_ADDRESS] as const,
    },
    ...requirements.map((requirement) => balanceCall(requirement, holder)),
  ];

  let entries: MulticallEntry[];

  try {
    entries = (await client.multicall({
      allowFailure: true,
      batchSize: 0,
      contracts,
    })) as unknown as MulticallEntry[];
  } catch {
    return {
      votingPower: null,
      botHasRole: null,
      rows: requirements.map((requirement) => ({
        groupId: requirement.id,
        name: requirement.name,
        votes: requirement.defaultVotingPower,
        status: "unknown",
      })),
    };
  }

  const [voterEntry, roleEntry, ...balanceEntries] = entries;

  const voter =
    voterEntry?.status === "success"
      ? (voterEntry.result as { votingPower: bigint })
      : null;

  return {
    votingPower: voter ? BigInt(voter.votingPower) : null,
    botHasRole:
      roleEntry?.status === "success" ? Boolean(roleEntry.result) : null,
    rows: requirements.map((requirement, index) => ({
      groupId: requirement.id,
      name: requirement.name,
      votes: requirement.defaultVotingPower,
      status: toStatus(balanceEntries[index]),
    })),
  };
}

/**
 * The group a wallet lands in when it meets more than one requirement: the
 * largest single allocation, never the sum, with ties broken toward the group
 * created first (the lowest id).
 */
export function selectWinner(
  rows: RequirementRow[],
  requirements: NftRequirement[],
): NftRequirement | null {
  const met = rows
    .filter((row) => row.status === "met")
    .map((row) => requirements.find((entry) => entry.id === row.groupId))
    .filter((entry): entry is NftRequirement => !!entry)
    .sort((a, b) => b.defaultVotingPower - a.defaultVotingPower || a.id - b.id);

  return met[0] ?? null;
}
