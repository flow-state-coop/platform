"use client";

import { useMemo } from "react";
import { base } from "viem/chains";
import { useQuery, gql } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import RoundCard from "./components/RoundCard";
import { Inflow } from "@/types/inflow";
import { GDAPool } from "@/types/gdaPool";
import { getApolloClient } from "@/lib/apollo";
import { useMediaQuery } from "@/hooks/mediaQuery";

type ExploreProps = {
  coreInflow: Inflow;
  greenpillInflow: Inflow;
  guildGuildInflow: Inflow;
  chonesGuildInflow: Inflow;
  goodDollarPool: GDAPool;
};

const SQF_STREAM_QUERY = gql`
  query SQFQuery($gdaPool: String, $superapps: [String]) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
    }
    accounts(where: { id_in: $superapps }) {
      id
      accountTokenSnapshots {
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
        totalInflowRate
      }
    }
  }
`;

const GDA_POOL_QUERY = gql`
  query GDAPoolQuery($gdaPool: String) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
    }
  }
`;

const SQF_ADDRESSES = {
  ["octant"]: {
    gdaPool: "0x8398c030be586c86759c4f1fc9f63df83c99813a",
    superApps: [
      "0x6e0c09d565debc9105efe51d892bda13967c32a6",
      "0x97491ffeaf4733f8cc8fd57d20c457ac3257d8aa",
      "0x6f5d20c798db69b5f0fac5a40998dd9c13be0a77",
      "0x312f110ca0077de3e51fccde0261fb59b9c8d942",
      "0x0f0b224b07655afa9239d76928399830e1fea8cf",
      "0xad69430421e41f570fe8a42a089a90b679ba4140",
      "0x297f7199c83fbb671b13d88d0cbf52b000d13de2",
      "0x81548f8eb73dcb288cc9d4de98db5cd6c5cfd61c",
      "0x1b50cea385649438c045642fab49e7f81abd7654",
      "0x9135a74b3d3cfde581379f686b7a9ee0464ac594",
      "0x8ad8b54f6a80c07afb6bf25596c59cdb9231ae5f",
      "0x04a229a85b29b25ef8c2c87e56d16a6c1fdf5f15",
      "0xb643e26381e75f1b3749ab9af01f9137bfb935be",
    ],
  },
};

const FLOW_CASTER_POOLS = [
  "0x9ef9fe8bf503b10698322e3a135c0fa6decc5b5b",
  "0x6719cbb70d0faa041f1056542af66066e3cc7a24",
];

export default function Explore(props: ExploreProps) {
  const {
    coreInflow,
    greenpillInflow,
    guildGuildInflow,
    chonesGuildInflow,
    goodDollarPool,
  } = props;

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();

  const { data: sqfStreamQueryRes, loading: sqfStreamQueryLoading } = useQuery(
    SQF_STREAM_QUERY,
    {
      client: getApolloClient("superfluid", base.id),
      variables: {
        gdaPool: SQF_ADDRESSES["octant"].gdaPool,
        superapps: SQF_ADDRESSES["octant"].superApps,
      },
      pollInterval: 10000,
    },
  );
  const {
    data: flowCasterCrackedDevsQueryRes,
    loading: flowCasterCrackedDevsQueryLoading,
  } = useQuery(GDA_POOL_QUERY, {
    client: getApolloClient("superfluid", base.id),
    variables: {
      gdaPool: FLOW_CASTER_POOLS[0],
    },
    pollInterval: 10000,
  });
  const { data: flowCasterTeamQueryRes, loading: flowCasterTeamQueryLoading } =
    useQuery(GDA_POOL_QUERY, {
      client: getApolloClient("superfluid", base.id),
      variables: {
        gdaPool: FLOW_CASTER_POOLS[1],
      },
      pollInterval: 10000,
    });

  const flowCasterCrackedDevsPool = flowCasterCrackedDevsQueryRes?.pool;
  const flowCasterTeamPool = flowCasterTeamQueryRes?.pool;

  const flowCasterFlowInfo = useMemo(() => {
    const now = (Date.now() / 1000) | 0;
    const totalCrackedDevs = flowCasterCrackedDevsPool
      ? BigInt(
          flowCasterCrackedDevsPool.totalAmountFlowedDistributedUntilUpdatedAt,
        ) +
        BigInt(flowCasterCrackedDevsPool.flowRate) *
          BigInt(now - flowCasterCrackedDevsPool.updatedAtTimestamp)
      : BigInt(0);
    const totalTeam = flowCasterTeamPool
      ? BigInt(flowCasterTeamPool.totalAmountFlowedDistributedUntilUpdatedAt) +
        BigInt(flowCasterTeamPool.flowRate) *
          BigInt(now - flowCasterTeamPool.updatedAtTimestamp)
      : BigInt(0);

    return {
      totalDistributed: totalCrackedDevs + totalTeam,
      flowRate:
        BigInt(flowCasterCrackedDevsPool?.flowRate ?? 0) +
        BigInt(flowCasterTeamPool?.flowRate ?? 0),
      updatedAt: now,
    };
  }, [flowCasterCrackedDevsPool, flowCasterTeamPool]);

  return (
    <Stack direction="vertical" className="explore-background pb-30">
      <Stack
        direction="vertical"
        gap={6}
        className="align-items-center px-2 py-17 px-lg-30 px-xxl-52 text-center"
      >
        <h1
          className="m-0 fw-bold"
          style={{ lineHeight: "95%", fontSize: isMobile ? 76 : 120 }}
        >
          Explore flows.
        </h1>
        <h2 className="fs-6 mb-4">
          Participate in Flow State streaming funding campaigns or launch your
          own.
        </h2>
      </Stack>
      {sqfStreamQueryLoading ||
      flowCasterCrackedDevsQueryLoading ||
      flowCasterTeamQueryLoading ? (
        <Stack
          direction="horizontal"
          className="justify-content-center my-5 py-5"
        >
          <Spinner />
        </Stack>
      ) : (
        <>
          <div
            className="px-2 pb-20 px-lg-30 px-xxl-52"
            style={{
              display: "grid",
              columnGap: "1.5rem",
              rowGap: "3rem",
              justifyItems: "center",
              gridTemplateColumns: isTablet
                ? "repeat(1,minmax(0,1fr))"
                : isSmallScreen
                  ? "repeat(2,minmax(0,1fr))"
                  : isMediumScreen || isBigScreen
                    ? "repeat(3,minmax(0,1fr))"
                    : "",
            }}
          >
            <RoundCard
              name="Flow Caster"
              image="/logo-blue.svg"
              roundType="Mini App"
              totalStreamedUntilUpdatedAt={flowCasterFlowInfo.totalDistributed.toString()}
              flowRate={flowCasterFlowInfo.flowRate.toString()}
              updatedAt={flowCasterFlowInfo.updatedAt}
              tokenSymbol="USDCx"
              link="https://farcaster.xyz/miniapps/0EyeQpCD0lSP/flowcaster"
              showSupRewards={true}
            />
            <RoundCard
              name="GoodBuilders Program"
              image="/good-dollar.png"
              roundType="Flow Council"
              totalStreamedUntilUpdatedAt={BigInt(
                goodDollarPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
              ).toString()}
              flowRate={BigInt(goodDollarPool?.flowRate ?? 0).toString()}
              updatedAt={goodDollarPool?.updatedAtTimestamp}
              tokenSymbol="G$"
              link="/gooddollar"
              showSupRewards={true}
            />
            <RoundCard
              name="Core Contributors"
              image="/logo-blue.svg"
              roundType="Flow Guild"
              totalStreamedUntilUpdatedAt={BigInt(
                coreInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
              ).toString()}
              flowRate={BigInt(coreInflow?.totalInflowRate ?? 0).toString()}
              updatedAt={coreInflow?.updatedAtTimestamp}
              tokenSymbol="ETHx"
              link="/flow-guilds/core"
            />
            <RoundCard
              name="Octant Builder Accelerator"
              image="/octant-circle.svg"
              roundType="Streaming Quadratic Funding"
              totalStreamedUntilUpdatedAt={(
                BigInt(
                  sqfStreamQueryRes?.pool
                    .totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
                ) +
                BigInt(
                  sqfStreamQueryRes?.accounts
                    .map(
                      (account: {
                        accountTokenSnapshots: {
                          totalAmountStreamedInUntilUpdatedAt: string;
                        }[];
                      }) =>
                        BigInt(
                          account.accountTokenSnapshots[0]
                            .totalAmountStreamedInUntilUpdatedAt,
                        ),
                    )
                    .reduce((a: bigint, b: bigint) => a + b) ?? 0,
                )
              ).toString()}
              flowRate={(
                BigInt(sqfStreamQueryRes?.pool.flowRate ?? 0) +
                BigInt(
                  sqfStreamQueryRes?.accounts
                    .map(
                      (account: {
                        accountTokenSnapshots: { totalInflowRate: string }[];
                      }) =>
                        BigInt(
                          account.accountTokenSnapshots[0].totalInflowRate ?? 0,
                        ),
                    )
                    .reduce((a: bigint, b: bigint) => a + b) ?? 0,
                )
              ).toString()}
              updatedAt={sqfStreamQueryRes?.pool.updatedAtTimestamp}
              tokenSymbol="ETHx"
              link="/octant"
            />
            <RoundCard
              name="Greenpill Dev Guild"
              image="/greenpill.png"
              roundType="Flow Guild"
              totalStreamedUntilUpdatedAt={BigInt(
                greenpillInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
              ).toString()}
              flowRate={BigInt(
                greenpillInflow?.totalInflowRate ?? 0,
              ).toString()}
              updatedAt={greenpillInflow?.updatedAtTimestamp}
              tokenSymbol="ETHx"
              link="/flow-guilds/greenpilldevguild"
            />
            <RoundCard
              name="Guild Guild"
              image="/guild-guild.png"
              roundType="Flow Guild"
              totalStreamedUntilUpdatedAt={BigInt(
                guildGuildInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
              ).toString()}
              flowRate={BigInt(
                guildGuildInflow?.totalInflowRate ?? 0,
              ).toString()}
              updatedAt={guildGuildInflow?.updatedAtTimestamp}
              tokenSymbol="ETHx"
              link="/flow-guilds/guild-guild"
            />
            <RoundCard
              name="Chones Guild"
              image="/chones-guild.svg"
              roundType="Flow Guild"
              totalStreamedUntilUpdatedAt={BigInt(
                guildGuildInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
              ).toString()}
              flowRate={BigInt(
                chonesGuildInflow?.totalInflowRate ?? 0,
              ).toString()}
              updatedAt={chonesGuildInflow?.updatedAtTimestamp}
              tokenSymbol="ETHx"
              link="/flow-guilds/chonesguild"
            />
          </div>
        </>
      )}
    </Stack>
  );
}
