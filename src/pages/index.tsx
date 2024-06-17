import { useCallback, useState, useRef, useEffect } from "react";
import { GetServerSideProps } from "next";
import { useQuery, gql } from "@apollo/client";
import { parseEther } from "viem";
import { useInView } from "react-intersection-observer";
import { useReadContract } from "wagmi";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Spinner from "react-bootstrap/Spinner";
import PoolInfo from "@/components/PoolInfo";
import Grantee from "@/components/Grantee";
import { Recipient } from "@/types/recipient";
import { strategyAbi } from "@/lib/abi/strategy";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { shuffle } from "@/lib/utils";
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

enum SortingMethod {
  RANDOM = "Random Order",
  ALPHABETICAL = "Alphabetical",
  POPULAR = "Popular",
}

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
  const [directTotal, setDirectTotal] = useState(BigInt(0));
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);

  const skipGrantees = useRef(0);
  const granteesBatch = useRef(1);
  const hasNextGrantee = useRef(true);
  const directTotalTimerId = useRef<NodeJS.Timeout>();

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

  const pool = streamingFundQueryRes?.pool ?? null;
  const network = networks.find(
    (network) => network.id === Number(chainId ?? DEFAULT_CHAIN_ID),
  );
  const donationToken =
    network?.tokens.find((token) => allocationSuperToken === token.address)
      ?.name ?? "N/A";
  const matchingToken =
    network?.tokens.find((token) => pool?.token === token.address.toLowerCase())
      ?.name ?? "N/A";

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

  const sortGrantees = useCallback(
    (grantees: Grantee[]) => {
      if (sortingMethod === SortingMethod.RANDOM) {
        return shuffle(grantees);
      }

      if (sortingMethod === SortingMethod.ALPHABETICAL) {
        return grantees.sort((a, b) => {
          if (a.name < b.name) {
            return -1;
          }

          if (a.name > b.name) {
            return 1;
          }

          return 0;
        });
      }

      if (sortingMethod === SortingMethod.POPULAR) {
        return grantees.sort((a, b) => b.allocatorsCount - a.allocatorsCount);
      }

      return grantees;
    },
    [sortingMethod],
  );

  useEffect(() => {
    if (
      !streamingFundQueryRes?.pool ||
      !superfluidQueryRes?.accounts ||
      !superfluidQueryRes?.pool
    ) {
      return;
    }

    if (inView) {
      const grantees: Grantee[] = [];

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

      setGrantees((prev) =>
        sortingMethod !== SortingMethod.RANDOM
          ? sortGrantees(prev.concat(grantees))
          : prev.concat(grantees),
      );
    } else {
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
    }
  }, [
    streamingFundQueryRes,
    superfluidQueryRes,
    inView,
    getGrantee,
    sortingMethod,
    sortGrantees,
  ]);

  useEffect(() => {
    setGrantees((prev) => sortGrantees(prev));
  }, [sortingMethod, sortGrantees]);

  useEffect(() => {
    if (superfluidQueryRes?.accounts.length > 0) {
      const calcDirectTotal = () => {
        let directTotal = BigInt(0);

        for (const account of superfluidQueryRes.accounts) {
          const elapsed = BigInt(
            Date.now() -
              account.accountTokenSnapshots[0].updatedAtTimestamp * 1000,
          );
          directTotal +=
            BigInt(
              account.accountTokenSnapshots[0]
                .totalAmountStreamedInUntilUpdatedAt,
            ) +
            (BigInt(account.accountTokenSnapshots[0].totalInflowRate) *
              elapsed) /
              BigInt(1000);
        }

        return directTotal;
      };

      clearInterval(directTotalTimerId.current);

      directTotalTimerId.current = setInterval(
        () => setDirectTotal(calcDirectTotal()),
        1000,
      );
    }

    return () => clearInterval(directTotalTimerId.current);
  }, [superfluidQueryRes, directTotalTimerId]);

  return (
    <>
      <PoolInfo
        name={pool?.metadata.name ?? "N/A"}
        description={pool?.metadata.description ?? "N/A"}
        matchingFlowRate={BigInt(superfluidQueryRes?.pool?.flowRate ?? 0)}
        directFlowRate={
          superfluidQueryRes?.accounts
            ? superfluidQueryRes?.accounts
                .map(
                  (account: {
                    accountTokenSnapshots: {
                      totalInflowRate: string;
                    }[];
                  }) =>
                    BigInt(account.accountTokenSnapshots[0].totalInflowRate),
                )
                .reduce((a: bigint, b: bigint) => a + b, BigInt(0))
            : BigInt(0)
        }
        directTotal={directTotal}
        matchingTotalDistributed={BigInt(
          superfluidQueryRes?.pool
            ?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
        )}
        matchingUpdatedAt={superfluidQueryRes?.pool?.updatedAtTimestamp ?? "0"}
        donationToken={donationToken}
        matchingToken={matchingToken}
        directFunders={
          superfluidQueryRes?.accounts
            ? superfluidQueryRes?.accounts
                .map(
                  (account: {
                    accountTokenSnapshots: {
                      activeIncomingStreamCount: number;
                    }[];
                  }) =>
                    account.accountTokenSnapshots[0].activeIncomingStreamCount,
                )
                .reduce((a: number, b: number) => a + b)
            : 0
        }
      />
      <Stack direction="horizontal" gap={4} className="p-5 pt-4 fs-4">
        Grantees
        <Dropdown>
          <Dropdown.Toggle
            variant="transparent"
            className="d-flex justify-content-between align-items-center border border-2 border-gray"
            style={{ width: 156 }}
          >
            {sortingMethod}
          </Dropdown.Toggle>

          <Dropdown.Menu>
            <Dropdown.Item
              onClick={() => setSortingMethod(SortingMethod.RANDOM)}
            >
              {SortingMethod.RANDOM}
            </Dropdown.Item>
            <Dropdown.Item
              onClick={() => setSortingMethod(SortingMethod.ALPHABETICAL)}
            >
              {SortingMethod.ALPHABETICAL}
            </Dropdown.Item>
            <Dropdown.Item
              onClick={() => setSortingMethod(SortingMethod.POPULAR)}
            >
              {SortingMethod.POPULAR}
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      <Container
        className="p-4 pt-0"
        style={{
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "repeat(auto-fit, minMax(320px, 1fr))",
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
