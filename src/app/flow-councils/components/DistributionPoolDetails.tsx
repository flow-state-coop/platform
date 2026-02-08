import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import Markdown from "@/components/Markdown";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Collapse from "react-bootstrap/Collapse";
import { GDAPool } from "@/types/gdaPool";
import { Token } from "@/types/token";
import { SuperAppFunderData } from "@/app/flow-councils/hooks/superAppFundersQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import { roundWeiAmount, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface DistributionPoolDetailsProps {
  distributionPool?: GDAPool;
  token: Token;
  councilMetadata: { name: string; description: string; logoUrl: string };
  superAppFunderData?: SuperAppFunderData;
  outflowToSplitter?: {
    currentFlowRate: string;
    streamedUntilUpdatedAt: string;
    updatedAtTimestamp: number;
  } | null;
}

export default function DistributionPoolDetails(
  props: DistributionPoolDetailsProps,
) {
  const {
    distributionPool,
    token,
    councilMetadata,
    superAppFunderData,
    outflowToSplitter,
  } = props;

  const [showFullDescription, setShowFullDescription] = useState(false);
  const { address } = useAccount();
  const isLongDescription = councilMetadata.description.length > 200;
  const hasSplitter = !!superAppFunderData;

  const userDistributionInfo = useMemo(() => {
    if (hasSplitter && outflowToSplitter) {
      return {
        totalDistributedUserUntilUpdatedAt: BigInt(
          outflowToSplitter.streamedUntilUpdatedAt,
        ),
        updatedAtTimestamp: outflowToSplitter.updatedAtTimestamp,
        flowRate: BigInt(outflowToSplitter.currentFlowRate),
      };
    }

    if (address && distributionPool) {
      const distributor = distributionPool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return {
          totalDistributedUserUntilUpdatedAt: BigInt(
            distributor.totalAmountFlowedDistributedUntilUpdatedAt,
          ),
          updatedAtTimestamp: distributor.updatedAtTimestamp,
          flowRate: BigInt(distributor.flowRate),
        };
      }
    }

    return null;
  }, [address, distributionPool, hasSplitter, outflowToSplitter]);

  const totalDistributedUser = useFlowingAmount(
    userDistributionInfo?.totalDistributedUserUntilUpdatedAt ?? BigInt(0),
    userDistributionInfo?.updatedAtTimestamp ?? 0,
    userDistributionInfo?.flowRate ?? BigInt(0),
  );
  const poolFlowRate = hasSplitter
    ? BigInt(superAppFunderData.totalInflowRate)
    : BigInt(distributionPool?.flowRate ?? 0);
  const poolTotalStreamed = hasSplitter
    ? BigInt(superAppFunderData.totalAmountStreamedInUntilUpdatedAt)
    : BigInt(
        distributionPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
      );
  const poolUpdatedAt = hasSplitter
    ? superAppFunderData.updatedAtTimestamp
    : (distributionPool?.updatedAtTimestamp ?? 0);
  const totalDistributedAll = useFlowingAmount(
    poolTotalStreamed,
    poolUpdatedAt,
    poolFlowRate,
  );
  const monthlyStreamToReceiver = Number(
    roundWeiAmount(
      BigInt(userDistributionInfo?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH),
      4,
    ),
  );
  const totalMonthlyStream = Number(
    formatEther(poolFlowRate * BigInt(SECONDS_IN_MONTH)),
  );

  return (
    <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4">
      <Stack direction="horizontal" gap={2} className="align-items-center mt-3">
        <Image
          src={councilMetadata.logoUrl || "/logo-blue.svg"}
          alt={councilMetadata.name}
          width={96}
          height={96}
          className="ms-2 rounded-4"
        />
        <Card className="bg-transparent border-0 ms-3">
          <Card.Title className="fs-lg fw-semi-bold text-secondary">
            {councilMetadata.name || "Distribution Pool"}
          </Card.Title>
          <Card.Subtitle className="mb-0 fs-lg">
            Your Current Stream
          </Card.Subtitle>
          <Card.Body className="d-flex align-items-center gap-2 p-0">
            <Card.Text as="span" className="fs-3 fw-bold">
              {formatNumber(monthlyStreamToReceiver)}
            </Card.Text>
            <Card.Text as="small" className="mt-1">
              {token.symbol} <br />
              per <br />
              month
            </Card.Text>
          </Card.Body>
        </Card>
      </Stack>
      <Stack direction="horizontal" gap={1} className="fs-lg p-4 pb-0">
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">You</Card.Text>
          <Badge className="bg-primary rounded-2 p-2 text-start fw-bold">
            {formatNumber(monthlyStreamToReceiver)}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">Others</Card.Text>
          <Badge className="bg-info rounded-2 p-2 text-start fw-bold">
            {formatNumber(
              totalMonthlyStream - monthlyStreamToReceiver > 0
                ? totalMonthlyStream - monthlyStreamToReceiver
                : 0,
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">All</Card.Text>
          <Badge className="bg-secondary rounded-2 p-2 text-start fw-bold">
            {formatNumber(totalMonthlyStream)}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20 mt-4">
          monthly
        </Card.Text>
      </Stack>
      <Stack direction="horizontal" gap={1} className="fs-lg px-4 py-2">
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-primary rounded-2 p-2 text-start fw-bold">
            {formatNumber(Number(formatEther(totalDistributedUser)))}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-info rounded-2 p-2 text-start fw-bold">
            {formatNumber(
              Number(formatEther(totalDistributedAll - totalDistributedUser)),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-secondary rounded-2 p-2 text-start fw-bold">
            {formatNumber(Number(formatEther(totalDistributedAll)))}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20">
          total
        </Card.Text>
      </Stack>
      {councilMetadata.description ? (
        <Stack direction="vertical" className="p-4" style={{ maxWidth: 500 }}>
          {isLongDescription ? (
            <>
              <Collapse in={showFullDescription}>
                <div>
                  <Markdown className="fs-lg">
                    {councilMetadata.description}
                  </Markdown>
                </div>
              </Collapse>
              {!showFullDescription && (
                <Markdown className="fs-lg">
                  {councilMetadata.description.substring(0, 200) + "..."}
                </Markdown>
              )}
              <Button
                variant="link"
                className="p-0 text-start text-primary fw-semi-bold"
                onClick={() => setShowFullDescription(!showFullDescription)}
              >
                {showFullDescription ? "Show less" : "Show more"}
              </Button>
            </>
          ) : (
            <Markdown className="fs-lg">{councilMetadata.description}</Markdown>
          )}
        </Stack>
      ) : (
        <Card.Text className="m-0 p-4 fs-lg" style={{ maxWidth: 500 }}>
          Fund the distribution pool by opening a stream to it.
        </Card.Text>
      )}
    </Stack>
  );
}
