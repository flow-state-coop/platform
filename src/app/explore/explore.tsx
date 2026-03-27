"use client";

import Stack from "react-bootstrap/Stack";
import RoundCard from "./components/RoundCard";
import { Inflow } from "@/types/inflow";
import { GDAPool } from "@/types/gdaPool";
import { useMediaQuery } from "@/hooks/mediaQuery";

type PoolPairFlowInfo = {
  totalDistributed: bigint;
  flowRate: bigint;
  updatedAt: number;
  donors: number;
};

type ExploreProps = {
  coreInflow: Inflow;
  greenpillInflow: Inflow;
  guildGuildInflow: Inflow;
  chonesGuildInflow: Inflow;
  goodDollarPool: GDAPool;
  goodBuildersS3Inflow: Inflow;
  flowCasterArbFlowInfo: PoolPairFlowInfo;
  flowCasterFlowInfo: PoolPairFlowInfo;
};

// Octant round snapshot (round concluded)
const OCTANT_SNAPSHOT = {
  totalStreamed: "31567573000000000000", // 31.567573 ETH
  flowRate: "0",
  activeStreams: 266,
};

export default function Explore(props: ExploreProps) {
  const {
    coreInflow,
    greenpillInflow,
    guildGuildInflow,
    chonesGuildInflow,
    goodDollarPool,
    goodBuildersS3Inflow,
    flowCasterArbFlowInfo,
    flowCasterFlowInfo,
  } = props;

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();

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
          Explore flows
        </h1>
        <h2 className="fs-6 mb-4">
          Participate in Flow State streaming funding campaigns or launch your
          own.
        </h2>
      </Stack>
      <div className="px-2 pb-20 px-lg-30 px-xxl-52">
        <span className="fs-4 fw-semi-bold">Active</span>
        <div
          className="mt-2 mb-6"
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
            name="GoodBuilders S3"
            image="/good-dollar.png"
            roundType="Flow Council"
            totalStreamedUntilUpdatedAt={BigInt(
              goodBuildersS3Inflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
            ).toString()}
            flowRate={BigInt(
              goodBuildersS3Inflow?.totalInflowRate ?? 0,
            ).toString()}
            updatedAt={goodBuildersS3Inflow?.updatedAtTimestamp}
            activeStreamCount={goodBuildersS3Inflow?.activeIncomingStreamCount}
            tokenSymbol="G$"
            link="https://flowstate.network/goodbuilders-3"
          />
          <RoundCard
            name="Arbitrum Mini Apps"
            image="/arb.png"
            roundType="Flow Caster"
            totalStreamedUntilUpdatedAt={flowCasterArbFlowInfo.totalDistributed.toString()}
            flowRate={flowCasterArbFlowInfo.flowRate.toString()}
            updatedAt={flowCasterArbFlowInfo.updatedAt}
            activeStreamCount={flowCasterArbFlowInfo.donors}
            tokenSymbol="USDN"
            link="https://farcaster.xyz/miniapps/0EyeQpCD0lSP/flowcaster"
            showSupRewards
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
            activeStreamCount={coreInflow?.activeIncomingStreamCount}
            tokenSymbol="ETHx"
            link="/flow-guilds/core"
          />
          <RoundCard
            name="Cracked Devs"
            image="/logo-blue.svg"
            roundType="Flow Caster"
            totalStreamedUntilUpdatedAt={flowCasterFlowInfo.totalDistributed.toString()}
            flowRate={flowCasterFlowInfo.flowRate.toString()}
            updatedAt={flowCasterFlowInfo.updatedAt}
            activeStreamCount={flowCasterFlowInfo.donors}
            tokenSymbol="USDCx"
            link="https://farcaster.xyz/miniapps/0EyeQpCD0lSP/flowcaster"
          />
          <RoundCard
            name="Guild Guild"
            image="/guild-guild.png"
            roundType="Flow Guild"
            totalStreamedUntilUpdatedAt={BigInt(
              guildGuildInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
            ).toString()}
            flowRate={BigInt(guildGuildInflow?.totalInflowRate ?? 0).toString()}
            updatedAt={guildGuildInflow?.updatedAtTimestamp}
            activeStreamCount={guildGuildInflow?.activeIncomingStreamCount}
            tokenSymbol="ETHx"
            link="/flow-guilds/guild-guild"
          />
        </div>
        <span className="fs-4 fw-semi-bold">Completed</span>
        <div
          className="mt-2"
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
            name="Octant Builder Accelerator"
            image="/octant-circle.svg"
            roundType="Streaming Quadratic Funding"
            totalStreamedUntilUpdatedAt={OCTANT_SNAPSHOT.totalStreamed}
            flowRate={OCTANT_SNAPSHOT.flowRate}
            updatedAt={0}
            activeStreamCount={OCTANT_SNAPSHOT.activeStreams}
            tokenSymbol="ETHx"
            link="/octant"
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
            activeStreamCount={goodDollarPool?.poolDistributors.length}
            tokenSymbol="G$"
            link="https://gooddollar.org"
          />
          <RoundCard
            name="Greenpill Dev Guild"
            image="/greenpill.png"
            roundType="Flow Guild"
            totalStreamedUntilUpdatedAt={BigInt(
              greenpillInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
            ).toString()}
            flowRate={BigInt(greenpillInflow?.totalInflowRate ?? 0).toString()}
            updatedAt={greenpillInflow?.updatedAtTimestamp}
            activeStreamCount={greenpillInflow?.activeIncomingStreamCount}
            tokenSymbol="ETHx"
            link="/flow-guilds/greenpilldevguild"
          />
          <RoundCard
            name="Chones Guild"
            image="/chones-guild.svg"
            roundType="Flow Guild"
            totalStreamedUntilUpdatedAt={BigInt(
              chonesGuildInflow?.totalAmountStreamedInUntilUpdatedAt ?? 0,
            ).toString()}
            flowRate={BigInt(
              chonesGuildInflow?.totalInflowRate ?? 0,
            ).toString()}
            updatedAt={chonesGuildInflow?.updatedAtTimestamp}
            activeStreamCount={chonesGuildInflow?.activeIncomingStreamCount}
            tokenSymbol="ETHx"
            link="/flow-guilds/chonesguild"
          />
        </div>
      </div>
    </Stack>
  );
}
