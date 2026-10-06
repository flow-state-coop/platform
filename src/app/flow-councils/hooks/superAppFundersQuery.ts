import { useMemo } from "react";
import { useQuery as useApolloQuery, gql } from "@apollo/client";
import { useQuery as useFetchQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import type { Address } from "viem";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";
import { CELO_CHAIN_ID } from "@/app/flow-councils/lib/constants";
import {
  type IndexedSuperAppFunders,
  type SuperAppFunderData,
  type SuperAppPoolTotals,
  parseSuperAppFunderReads,
  reconcileSuperAppFunders,
  superAppFunderReads,
} from "@/lib/superAppFunders";

export type { SuperAppFunderData };

const UNRELIABLE_INDEXER_CHAIN_IDS = [CELO_CHAIN_ID];

const SUPER_APP_FUNDERS_QUERY = gql`
  query SuperAppFundersQuery($superApp: ID!, $token: String!) {
    account(id: $superApp) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
        totalNetFlowRate
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
      }
      inflows(where: { currentFlowRate_gt: "0", token: $token }) {
        sender {
          id
        }
      }
    }
  }
`;

async function fetchExplorerSenders(
  chainId: number,
  splitter: string,
  token: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    chainId: String(chainId),
    splitter,
    token,
  });
  const res = await fetch(`/api/superapp-funders?${params}`);

  if (!res.ok) {
    return [];
  }

  const { senders } = (await res.json()) as { senders?: string[] };

  return senders ?? [];
}

export default function useSuperAppFundersQuery(
  network: Network,
  superAppAddress?: string | null,
  tokenAddress?: string,
  enabled = true,
  pool?: SuperAppPoolTotals,
): SuperAppFunderData | undefined {
  const isEnabled = !!superAppAddress && !!tokenAddress && enabled;
  const shouldVerifyOnChain =
    isEnabled && UNRELIABLE_INDEXER_CHAIN_IDS.includes(network.id);

  const { data } = useApolloQuery(SUPER_APP_FUNDERS_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      superApp: superAppAddress?.toLowerCase(),
      token: tokenAddress?.toLowerCase(),
    },
    skip: !isEnabled,
    pollInterval: 10000,
  });

  const { data: explorerSenders } = useFetchQuery({
    queryKey: ["superAppSenders", network.id, superAppAddress, tokenAddress],
    queryFn: () =>
      fetchExplorerSenders(network.id, superAppAddress!, tokenAddress!),
    enabled: shouldVerifyOnChain,
    staleTime: 60_000,
  });

  const indexed = useMemo((): IndexedSuperAppFunders | undefined => {
    const snapshot = data?.account?.accountTokenSnapshots?.[0];

    if (!snapshot) {
      return undefined;
    }

    const senders: string[] = (data.account.inflows ?? []).map(
      (inflow: { sender: { id: string } }) => inflow.sender.id.toLowerCase(),
    );

    return {
      totalInflowRate: snapshot.totalInflowRate,
      totalNetFlowRate: snapshot.totalNetFlowRate,
      totalAmountStreamedInUntilUpdatedAt:
        snapshot.totalAmountStreamedInUntilUpdatedAt,
      updatedAtTimestamp: Number(snapshot.updatedAtTimestamp),
      funderCount: senders.length,
      senders,
    };
  }, [data]);

  const senders = useMemo(
    () =>
      Array.from(
        new Set([
          ...(indexed?.senders ?? []),
          ...(explorerSenders ?? []).map((sender) => sender.toLowerCase()),
        ]),
      ),
    [indexed, explorerSenders],
  );

  const { data: reads } = useReadContracts({
    contracts:
      shouldVerifyOnChain && superAppAddress && tokenAddress
        ? superAppFunderReads({
            network,
            splitterAddress: superAppAddress as Address,
            tokenAddress: tokenAddress as Address,
            senders,
          })
        : [],
    query: { enabled: shouldVerifyOnChain, refetchInterval: 60_000 },
  });

  return useMemo(
    () =>
      reconcileSuperAppFunders({
        indexed,
        onChain: parseSuperAppFunderReads(reads, senders.length),
        pool,
      }),
    [indexed, reads, senders.length, pool],
  );
}
