import { useCallback, useState, useRef, useEffect } from "react";
import { GetServerSideProps } from "next";
import { useQuery, gql } from "@apollo/client";
import { parseEther } from "viem";
import { useInView } from "react-intersection-observer";
import { useReadContract } from "wagmi";
import Container from "react-bootstrap/Container";
import Spinner from "react-bootstrap/Spinner";
import Grantee from "@/components/Grantee";
import { Recipient } from "@/types/recipient";
import { strategyAbi } from "@/lib/abi/strategy";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type IndexProps = {
  poolId: string;
  chainId: string;
  grantee: string;
};

type Grantee = {
  id: string;
  name: string;
  description: string;
  image: string;
  allocationFlowRate: bigint;
  allocatorsCount: number;
  matchingFlowRate: bigint;
  impactMatchingEstimate: bigint;
  donationToken: string;
  matchingToken: string;
};

const POOL_QUERY = gql`
  query PoolQuery($poolId: String!, $chainId: Int!) {
    pool(chainId: $chainId, id: $poolId) {
      metadata
      strategyAddress
      token
      recipientsByPoolIdAndChainId(condition: { status: APPROVED }) {
        id
        recipientAddress
        metadata
        superappAddress
      }
    }
  }
`;

const STREAM_QUERY = gql`
  query StreamQuery($superapps: [String], $gdaPool: String) {
    accounts(where: { id_in: $superapps }) {
      id
      accountTokenSnapshots {
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
        totalInflowRate
        activeIncomingStreamCount
        token {
          id
        }
      }
    }
    pool(id: $gdaPool) {
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      poolMembers {
        account {
          id
        }
        units
        totalAmountClaimed
        updatedAtTimestamp
      }
    }
  }
`;

const DEFAULT_POOL_ID = "45";
const DEFAULT_CHAIN_ID = 11155420;
const GRANTEES_BATCH_SIZE = 20;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query } = ctx;

  return {
    props: {
      poolId: query.poolid ?? null,
      chainId: query.chainid ?? null,
      grantee: query.grantee ?? null,
    },
  };
};

export default function Index(props: IndexProps) {
  const { poolId, chainId } = props;

  const [grantees, setGrantees] = useState<Grantee[]>([]);

  const skipGrantees = useRef(0);
  const granteesBatch = useRef(1);
  const hasNextGrantee = useRef(true);

  const [sentryRef, inView] = useInView();

  const { data: streamingFundQueryRes } = useQuery(POOL_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      poolId: poolId ?? DEFAULT_POOL_ID,
      chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    },
  });
  const { data: gdaPoolAddress } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "gdaPool",
  });
  const { data: allocationSuperToken } = useReadContract({
    address: streamingFundQueryRes?.pool?.strategyAddress,
    abi: strategyAbi,
    functionName: "allocationSuperToken",
  });
  const { data: superfluidQueryRes } = useQuery(STREAM_QUERY, {
    client: getApolloClient(
      "superfluid",
      chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    ),
    variables: {
      superapps:
        streamingFundQueryRes?.pool?.recipientsByPoolIdAndChainId?.map(
          (recipient: { superappAddress: string }) => recipient.superappAddress,
        ) ?? [],
      gdaPool: gdaPoolAddress?.toLowerCase(),
    },
    pollInterval: 10000,
  });

  const network = networks.find(
    (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
  );
  const donationToken =
    network?.tokens.find((token) => allocationSuperToken === token.address)
      ?.name ?? "N/A";
  const matchingToken =
    network?.tokens.find(
      (token) =>
        streamingFundQueryRes?.pool?.token === token.address.toLowerCase(),
    )?.name ?? "N/A";

  const getGrantee = useCallback(
    (recipient: Recipient) => {
      const superappAccount = superfluidQueryRes.accounts.find(
        (account: { id: string }) => account.id === recipient.superappAddress,
      );
      const matchingPool = superfluidQueryRes.pool;
      const adjustedFlowRate =
        BigInt(matchingPool.flowRate) - BigInt(matchingPool.adjustmentFlowRate);
      const member = superfluidQueryRes.pool.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipient.recipientAddress,
      );
      const memberFlowRate =
        BigInt(matchingPool.totalUnits) > 0
          ? (BigInt(member.units) * adjustedFlowRate) /
            BigInt(matchingPool.totalUnits)
          : BigInt(0);
      const impactMatchingEstimate = calcMatchingImpactEstimate({
        totalFlowRate: BigInt(matchingPool.flowRate ?? 0),
        totalUnits: BigInt(matchingPool.totalUnits ?? 0),
        granteeUnits: BigInt(member.units),
        granteeFlowRate: memberFlowRate,
        previousFlowRate: BigInt(0),
        newFlowRate: parseEther("1") / BigInt(SECONDS_IN_MONTH),
      });

      return {
        id: recipient.id,
        name: recipient.metadata.title,
        description: recipient.metadata.description,
        image: recipient.metadata.logoImg,
        allocationFlowRate: BigInt(
          superappAccount?.accountTokenSnapshots[0].totalInflowRate ?? 0,
        ),
        allocatorsCount:
          superappAccount?.accountTokenSnapshots[0].activeIncomingStreamCount ??
          0,
        matchingFlowRate: memberFlowRate ?? BigInt(0),
        impactMatchingEstimate,
        donationToken,
        matchingToken,
      };
    },
    [superfluidQueryRes, donationToken, matchingToken],
  );

  useEffect(() => {
    if (
      !streamingFundQueryRes?.pool ||
      !superfluidQueryRes?.accounts ||
      !superfluidQueryRes?.pool
    ) {
      return;
    }

    const grantees: Grantee[] = [];

    if (inView) {
      for (
        let i = skipGrantees.current;
        i < GRANTEES_BATCH_SIZE * granteesBatch.current;
        i++
      ) {
        skipGrantees.current = i + 1;

        if (
          skipGrantees.current ==
          streamingFundQueryRes.pool.recipientsByPoolIdAndChainId.length
        ) {
          hasNextGrantee.current = false;
        }

        const recipient =
          streamingFundQueryRes.pool.recipientsByPoolIdAndChainId[i];

        if (recipient) {
          grantees.push(getGrantee(recipient));
        } else {
          break;
        }
      }

      if (grantees.length >= GRANTEES_BATCH_SIZE * granteesBatch.current) {
        granteesBatch.current++;
      }

      setGrantees((prev) => prev.concat(grantees));
    }

    setGrantees((prev) => {
      const grantees: Grantee[] = [];

      for (const recipient of streamingFundQueryRes.pool
        .recipientsByPoolIdAndChainId) {
        if (prev.find((grantee) => grantee.id === recipient.id)) {
          grantees.push(getGrantee(recipient));
        }
      }

      return grantees;
    });
  }, [streamingFundQueryRes, superfluidQueryRes, inView, getGrantee]);

  return (
    <>
      <Container
        className="p-4"
        style={{
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "repeat(auto-fit, minMax(360px, 1fr))",
          justifyItems: "center",
        }}
      >
        {grantees.map((grantee: Grantee, i: number) => (
          <Grantee
            key={i}
            name={grantee.name}
            description={grantee.description}
            image={grantee.image}
            allocatorsCount={grantee.allocatorsCount}
            allocationFlowRate={grantee.allocationFlowRate}
            matchingFlowRate={grantee.matchingFlowRate}
            impactMatchingEstimate={grantee.impactMatchingEstimate}
            donationToken={donationToken}
            matchingToken={matchingToken}
          />
        ))}
      </Container>
      {hasNextGrantee.current === true && (
        <Spinner ref={sentryRef} className="m-auto"></Spinner>
      )}
    </>
  );
}
