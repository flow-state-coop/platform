"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import CopyTooltip from "@/components/CopyTooltip";
import { GDAPool } from "@/types/gdaPool";
import { Project } from "@/types/project";
import { Network } from "@/types/network";
import { roundWeiAmount } from "@/lib/utils";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type PoolCardProps = {
  pool: {
    id: string;
    allocationToken: string;
    matchingToken: string;
    metadata: { name: string };
    recipientsByPoolIdAndChainId: { id: string; recipientAddress: string }[];
  };
  matchingPool: GDAPool;
  project: Project;
  network: Network;
};

export default function PoolCard(props: PoolCardProps) {
  const { pool, matchingPool, project, network } = props;

  const router = useRouter();
  const { address } = useAccount();
  const [poolNameRef, { clampedText }] = useClampText({
    text: pool.metadata.name ?? "N/A",
    ellipsis: "...",
    lines: 2,
  });

  const recipientId = pool.recipientsByPoolIdAndChainId.filter(
    (recipient: { id: string }) => recipient.id === project.anchorAddress,
  )[0]?.id;
  const allocationToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === pool.allocationToken,
  );
  const matchingToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === pool.matchingToken,
  );
  const poolFlowRateConfig = getPoolFlowRateConfig(
    allocationToken?.symbol ?? "",
  );
  const poolUiLink = `https://flowstate.network/pool/?poolId=${pool.id}&chainId=${network.id}&recipientId=${recipientId}`;
  const framesLink = `https://frames.flowstate.network/frames/grantee/${recipientId}/${pool.id}/${network.id}`;

  const matchingImpactEstimate = useMemo(() => {
    if (!matchingPool || !pool || !network) {
      return BigInt(0);
    }

    const recipientAddress = pool.recipientsByPoolIdAndChainId.find(
      (recipient) => recipient.id === project.anchorAddress,
    )?.recipientAddress;
    const adjustedFlowRate =
      BigInt(matchingPool.flowRate) - BigInt(matchingPool.adjustmentFlowRate);
    const member = matchingPool.poolMembers.find(
      (member: { account: { id: string } }) =>
        member.account.id === recipientAddress,
    );
    const memberFlowRate =
      BigInt(matchingPool.totalUnits) > 0
        ? (BigInt(member?.units ?? 0) * adjustedFlowRate) /
          BigInt(matchingPool.totalUnits)
        : BigInt(0);
    const matchingImpactEstimate = calcMatchingImpactEstimate({
      totalFlowRate: BigInt(matchingPool.flowRate ?? 0),
      totalUnits: BigInt(matchingPool.totalUnits ?? 0),
      granteeUnits: BigInt(member?.units ?? 0),
      granteeFlowRate: memberFlowRate,
      previousFlowRate: BigInt(0),
      newFlowRate:
        parseEther(poolFlowRateConfig.minAllocationPerMonth.toString()) /
        BigInt(SECONDS_IN_MONTH),
      flowRateScaling: poolFlowRateConfig.flowRateScaling,
    });

    return matchingImpactEstimate;
  }, [matchingPool, pool, project, network, poolFlowRateConfig]);

  return (
    <Stack direction="vertical" className="flex-grow-0" style={{ width: 256 }}>
      <Card className="border-black rounded-4">
        <Card.Header
          className="bg-transparent text-info text-center border-0"
          style={{ height: 64 }}
        >
          <Card.Text
            className="m-0"
            ref={poolNameRef as React.RefObject<HTMLParagraphElement>}
          >
            {clampedText}
          </Card.Text>
        </Card.Header>
        <Card.Body className="d-flex flex-column" style={{ height: 96 }}>
          <Card.Text className="mb-1 text-center">
            Matching Multiplier
          </Card.Text>
          <Card.Text className="mb-3 text-center">
            {allocationToken?.symbol === matchingToken?.symbol ? (
              <>
                x
                {parseFloat(
                  (
                    Number(
                      roundWeiAmount(
                        matchingImpactEstimate * BigInt(SECONDS_IN_MONTH),
                        18,
                      ),
                    ) / poolFlowRateConfig.minAllocationPerMonth
                  ).toFixed(2),
                )}
              </>
            ) : (
              <>
                {poolFlowRateConfig.minAllocationPerMonth}{" "}
                {allocationToken?.symbol ?? "N/A"} ={" "}
                {roundWeiAmount(
                  matchingImpactEstimate * BigInt(SECONDS_IN_MONTH),
                  4,
                )}{" "}
                {matchingToken?.symbol ?? "N/A"}
              </>
            )}
          </Card.Text>
        </Card.Body>
        <Card.Footer className="bg-transparent border-0">
          <Button className="d-flex justify-content-center mt-auto mb-1 w-100 p-0">
            <Link
              className="w-100 py-1 text-white text-decoration-none"
              href={`/pool/?chainId=${network.id}&poolId=${pool.id}&recipientId=${
                recipientId
              }`}
            >
              Donate
            </Link>
          </Button>
        </Card.Footer>
      </Card>
      <Stack
        direction="horizontal"
        className="align-items-start justify-content-around mt-2 mb-3"
      >
        <Button
          variant="link p-0"
          target="_blank"
          href={`https://warpcast.com/~/compose?text=I+just+opened+a+donation+stream+to+${project.metadata.title}+in+the+${pool.metadata.name}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+this+frame%3A&embeds[]=${encodeURIComponent(framesLink ?? "")}`}
        >
          <Image src="/warpcast.svg" alt="warpcast" width={24} height={24} />
        </Button>
        <Button
          variant="link p-0"
          target="_blank"
          href={`https://twitter.com/intent/tweet?text=I%20just%20opened%20a%20donation%20stream%20to%20${
            project.metadata.title
          }%20in%20the%20${pool.metadata.name}%20%23streamingqf%20round.%20Support%20public%20goods%20by%20opening%20your%20stream%20with%20a%20real-time%20matching%20multiplier%20here%3A%20${encodeURIComponent(poolUiLink)}`}
        >
          <Image src="/x-logo.svg" alt="x" width={20} height={20} />
        </Button>
        <Button
          variant="link p-0"
          target="_blank"
          href={`https://hey.xyz/?text=I+just+opened+a+donation+stream+to+${project.metadata.title}+in+the+${pool.metadata.name}+SQF+round%21+Support+public+goods+by+opening+your+stream+with+a+real%2Dtime+matching+multiplier+from+this+frame%3A+%0A%0A${encodeURIComponent(framesLink ?? "")}`}
        >
          <Image src="/hey.png" alt="lens" width={24} height={24} />
        </Button>
        <CopyTooltip
          contentClick="Link Copied"
          contentHover="Copy Link"
          handleCopy={() => navigator.clipboard.writeText(poolUiLink)}
          target={
            <Image
              src="/link.svg"
              alt="link"
              width={28}
              height={28}
              style={{ marginTop: 1 }}
            />
          }
        />
      </Stack>
      {project?.profileRolesByChainIdAndProfileId.find(
        (profile) => profile.role === "OWNER",
      )?.address === address?.toLowerCase() && (
        <>
          <PoolConnectionButton
            poolAddress={matchingPool.id}
            isConnected={
              matchingPool.poolMembers.find(
                (member: { account: { id: string } }) =>
                  member.account.id === address?.toLowerCase(),
              )?.isConnected ?? false
            }
            network={network}
          />
          <Button
            className="w-100 mt-2 text-white"
            onClick={() =>
              router.push(
                `/grantee/tools/?chainId=${network.id}&poolId=${pool.id}`,
              )
            }
          >
            Grantee Tools
          </Button>
        </>
      )}
    </Stack>
  );
}
