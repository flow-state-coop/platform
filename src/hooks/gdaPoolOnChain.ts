import { useMemo } from "react";
import { type Address, isAddress } from "viem";
import { useReadContracts } from "wagmi";
import { gdaPoolAbi, gdaForwarderAbi } from "@sfpro/sdk/abi";
import { Network } from "@/types/network";

const REFRESH_INTERVAL = 30000;

export type OnChainPoolMember = {
  address: Address;
  units: bigint;
  totalAmountReceived: bigint;
  isConnected: boolean;
};

export type GdaPoolOnChain = {
  totalUnits?: bigint;
  memberFlowRate?: bigint;
  superToken?: Address;
  members: OnChainPoolMember[];
  isIndexerStale: boolean;
  isMembersPending: boolean;
  updatedAtTimestamp: number;
};

export default function useGdaPoolOnChain({
  network,
  poolAddress,
  members,
  indexedTotalUnits,
  enabled = true,
}: {
  network?: Network;
  poolAddress?: string;
  members?: string[];
  indexedTotalUnits?: string;
  enabled?: boolean;
}): GdaPoolOnChain {
  const pool =
    poolAddress && isAddress(poolAddress)
      ? (poolAddress as Address)
      : undefined;
  const totalsEnabled = !!network && !!pool && enabled;

  const { data: totals } = useReadContracts({
    contracts:
      network && pool
        ? ([
            {
              address: pool,
              abi: gdaPoolAbi,
              functionName: "getTotalUnits",
              chainId: network.id,
            },
            {
              address: pool,
              abi: gdaPoolAbi,
              functionName: "getTotalFlowRate",
              chainId: network.id,
            },
            {
              address: pool,
              abi: gdaPoolAbi,
              functionName: "superToken",
              chainId: network.id,
            },
          ] as const)
        : [],
    query: { enabled: totalsEnabled, refetchInterval: REFRESH_INTERVAL },
  });

  const totalUnits =
    totals?.[0]?.status === "success"
      ? (totals[0]!.result as bigint)
      : undefined;
  const memberFlowRate =
    totals?.[1]?.status === "success"
      ? (totals[1]!.result as bigint)
      : undefined;
  const superToken =
    totals?.[2]?.status === "success"
      ? (totals[2]!.result as Address)
      : undefined;
  // Only units the indexer is missing count as staleness. A read that comes
  // back zero, from a wrong-network call or a failing RPC, must never wipe out
  // member data the indexer does have.
  const isIndexerStale =
    totalUnits !== undefined && totalUnits > BigInt(indexedTotalUnits ?? 0);

  const memberAddresses = useMemo(
    () =>
      Array.from(
        new Set(
          (members ?? [])
            .filter((member) => isAddress(member))
            .map((member) => member.toLowerCase()),
        ),
      ) as Address[],
    [members],
  );
  const membersEnabled =
    totalsEnabled && isIndexerStale && memberAddresses.length > 0;

  const {
    data: memberReads,
    dataUpdatedAt,
    isLoading: isMembersLoading,
  } = useReadContracts({
    contracts:
      network && pool
        ? memberAddresses.flatMap((member) => [
            {
              address: pool,
              abi: gdaPoolAbi,
              functionName: "getUnits",
              args: [member],
              chainId: network.id,
            },
            {
              address: pool,
              abi: gdaPoolAbi,
              functionName: "getTotalAmountReceivedByMember",
              args: [member],
              chainId: network.id,
            },
            {
              address: network.gdaForwarder,
              abi: gdaForwarderAbi,
              functionName: "isMemberConnected",
              args: [pool, member],
              chainId: network.id,
            },
          ])
        : [],
    query: { enabled: membersEnabled, refetchInterval: REFRESH_INTERVAL },
  });

  const onChainMembers = useMemo(() => {
    if (!memberReads) {
      return [];
    }

    return memberAddresses.flatMap((address, i) => {
      const units = memberReads[i * 3];
      const received = memberReads[i * 3 + 1];
      const connected = memberReads[i * 3 + 2];

      if (units?.status !== "success") {
        return [];
      }

      return [
        {
          address,
          units: units.result as bigint,
          totalAmountReceived:
            received?.status === "success" ? (received.result as bigint) : 0n,
          isConnected:
            connected?.status === "success"
              ? (connected.result as boolean)
              : false,
        },
      ];
    });
  }, [memberReads, memberAddresses]);

  return {
    totalUnits,
    memberFlowRate,
    superToken,
    members: onChainMembers,
    isIndexerStale,
    isMembersPending: membersEnabled && (isMembersLoading || !memberReads),
    updatedAtTimestamp: Math.floor((dataUpdatedAt || Date.now()) / 1000),
  };
}
