import { useMemo } from "react";
import { useQuery, gql } from "@apollo/client";
import { type Address } from "viem";
import { Network } from "@/types/network";
import { GDAPool } from "@/types/gdaPool";
import { getApolloClient } from "@/lib/apollo";
import useGdaPoolOnChain from "@/hooks/gdaPoolOnChain";

const SUPERFLUID_QUERY = gql`
  query DistributionPoolQuery($distributionPool: String, $superToken: String) {
    pool(id: $distributionPool) {
      id
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers(first: 1000) {
        account {
          id
        }
        units
        updatedAtTimestamp
        totalAmountReceivedUntilUpdatedAt
        isConnected
      }
      poolDistributors(first: 1000) {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
    token(id: $superToken) {
      id
      symbol
    }
  }
`;

export default function useDistributionPoolQuery({
  network,
  distributionPool,
  superToken,
  members,
  enabled = true,
}: {
  network?: Network;
  distributionPool?: string;
  superToken?: string;
  members?: string[];
  enabled?: boolean;
}) {
  const { data: superfluidQueryRes, loading } = useQuery(SUPERFLUID_QUERY, {
    client: getApolloClient("superfluid", network?.id),
    variables: {
      distributionPool: distributionPool?.toLowerCase(),
      superToken: superToken?.toLowerCase() ?? "",
    },
    skip: !network || !distributionPool || !enabled,
    pollInterval: 10000,
  });

  const indexedPool = superfluidQueryRes?.pool;
  const indexedToken = superfluidQueryRes?.token;
  const memberCandidates = useMemo(
    () => [
      ...(members ?? []),
      ...((indexedPool?.poolMembers ?? []) as GDAPool["poolMembers"]).map(
        (member) => member.account.id,
      ),
    ],
    [members, indexedPool],
  );
  const onChain = useGdaPoolOnChain({
    network,
    poolAddress: distributionPool,
    members: memberCandidates,
    indexedTotalUnits: indexedPool?.totalUnits,
    enabled,
  });

  const pool = useMemo((): GDAPool | undefined => {
    const tokenAddress = (indexedToken?.id ??
      onChain.superToken?.toLowerCase() ??
      superToken?.toLowerCase()) as Address | undefined;

    if (!tokenAddress) {
      return undefined;
    }

    const token = { id: tokenAddress, symbol: indexedToken?.symbol ?? "" };

    if (indexedPool && !onChain.isIndexerStale) {
      return { ...indexedPool, token };
    }

    if (onChain.totalUnits === undefined) {
      return indexedPool ? { ...indexedPool, token } : undefined;
    }

    const isIndexedMembersMissing =
      onChain.totalUnits > BigInt(0) &&
      BigInt(indexedPool?.totalUnits ?? 0) === BigInt(0);

    if (onChain.isMembersPending) {
      return indexedPool && !isIndexedMembersMissing
        ? { ...indexedPool, token }
        : undefined;
    }

    const flowRate = BigInt(
      indexedPool?.flowRate ?? onChain.memberFlowRate ?? BigInt(0),
    );
    const memberFlowRate = onChain.memberFlowRate ?? BigInt(0);

    return {
      id: distributionPool as Address,
      flowRate: flowRate.toString() as GDAPool["flowRate"],
      adjustmentFlowRate: (flowRate > memberFlowRate
        ? flowRate - memberFlowRate
        : BigInt(0)
      ).toString() as GDAPool["adjustmentFlowRate"],
      totalAmountFlowedDistributedUntilUpdatedAt:
        indexedPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? "0",
      totalAmountInstantlyDistributedUntilUpdatedAt:
        indexedPool?.totalAmountInstantlyDistributedUntilUpdatedAt ?? "0",
      updatedAtTimestamp:
        indexedPool?.updatedAtTimestamp ?? onChain.updatedAtTimestamp,
      totalUnits: onChain.totalUnits.toString() as GDAPool["totalUnits"],
      token,
      poolMembers: onChain.members.map((member) => ({
        account: { id: member.address },
        units: member.units.toString() as `${number}`,
        totalAmountReceivedUntilUpdatedAt:
          member.totalAmountReceived.toString() as `${number}`,
        updatedAtTimestamp: onChain.updatedAtTimestamp,
        isConnected: member.isConnected,
      })),
      poolDistributors: indexedPool?.poolDistributors ?? [],
    };
  }, [indexedPool, indexedToken, onChain, superToken, distributionPool]);

  return { pool, loading: loading || onChain.isMembersPending };
}
