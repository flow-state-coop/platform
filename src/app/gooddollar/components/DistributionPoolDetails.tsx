import { useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import { GDAPool } from "@/types/gdaPool";
import { Token } from "@/types/token";
import useFlowingAmount from "@/hooks/flowingAmount";
import { roundWeiAmount, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface DistributionPoolDetailsProps {
  gdaPool?: GDAPool;
  token: Token;
}

export default function DistributionPoolDetails(
  props: DistributionPoolDetailsProps,
) {
  const { gdaPool, token } = props;

  const { address } = useAccount();

  const userDistributionInfo = useMemo(() => {
    if (address && gdaPool) {
      const distributor = gdaPool.poolDistributors.find(
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
  }, [address, gdaPool]);

  const totalDistributedUser = useFlowingAmount(
    userDistributionInfo?.totalDistributedUserUntilUpdatedAt ?? BigInt(0),
    userDistributionInfo?.updatedAtTimestamp ?? 0,
    userDistributionInfo?.flowRate ?? BigInt(0),
  );
  const totalDistributedAll = useFlowingAmount(
    BigInt(gdaPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? BigInt(0)),
    gdaPool?.updatedAtTimestamp ?? 0,
    BigInt(gdaPool?.flowRate ?? 0),
  );
  const monthlyStreamToReceiver = Number(
    roundWeiAmount(
      BigInt(userDistributionInfo?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH),
      4,
    ),
  );
  const totalMonthlyStream = Number(
    formatEther(BigInt(gdaPool?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH)),
  );

  return (
    <Stack direction="vertical" className="bg-lace-100 rounded-4 p-4 pt-0">
      <Stack direction="horizontal" gap={2} className="align-items-center mt-3">
        <Image
          src="/good-dollar.png"
          alt="GoodDollar"
          width={96}
          height={96}
          className="ms-2 rounded-4"
        />
        <Card className="bg-transparent border-0 ms-3">
          <Card.Title className="fs-lg fw-semi-bold text-secondary">
            Distribution Pool
          </Card.Title>
          <Card.Subtitle className="mb-0 fs-lg">
            Your Current Stream
          </Card.Subtitle>
          <Card.Body className="d-flex align-items-center gap-2 p-0">
            <Card.Text as="span" className="fs-5 fw-bold">
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
      <Card.Text className="m-0 p-2" style={{ maxWidth: 500 }}>
        GoodBuilders Round 2 is a 3-month continuous funding round on Celo for
        projects and builders integrating with the GoodDollar ecosystem in
        meaningful ways. Add to the G$ funding pool with your own stream here!
      </Card.Text>
    </Stack>
  );
}
