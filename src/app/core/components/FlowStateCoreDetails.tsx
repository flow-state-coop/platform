"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import { GDAPool } from "@/types/gdaPool";
import useFlowingAmount from "@/hooks/flowingAmount";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface FlowStatecoreDetailsProps {
  matchingPool: GDAPool;
}

export default function FlowStatecoreDetails(props: FlowStatecoreDetailsProps) {
  const { matchingPool } = props;

  const { address } = useAccount();

  const userDistributionInfo = useMemo(() => {
    if (address && matchingPool) {
      const distributor = matchingPool.poolDistributors.find(
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
  }, [address, matchingPool]);

  const totalDistributedUser = useFlowingAmount(
    userDistributionInfo?.totalDistributedUserUntilUpdatedAt ?? BigInt(0),
    userDistributionInfo?.updatedAtTimestamp ?? 0,
    userDistributionInfo?.flowRate ?? BigInt(0),
  );
  const totalDistributedAll = useFlowingAmount(
    BigInt(
      matchingPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? BigInt(0),
    ),
    matchingPool?.updatedAtTimestamp ?? 0,
    BigInt(matchingPool?.flowRate ?? 0),
  );

  return (
    <Stack direction="vertical" className="bg-light rounded-4 p-2 pt-0">
      <Stack direction="horizontal" gap={2} className="align-items-start mt-3">
        <Image
          src="/logo.png"
          alt="SQF"
          width={96}
          height={96}
          className="ms-2 rounded-4"
        />
        <Card className="bg-transparent border-0 ms-2">
          <Card.Title className="fs-4 text-secondary">
            Flow State Core
          </Card.Title>
        </Card>
      </Stack>
      <Stack direction="horizontal" gap={1} className="fs-6 p-2 pb-0">
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">You</Card.Text>
          <Badge className="bg-primary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(
              Number(
                formatEther(
                  BigInt(userDistributionInfo?.flowRate ?? 0) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">Others</Card.Text>
          <Badge className="bg-info rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(
              Number(
                formatEther(
                  (BigInt(matchingPool?.flowRate ?? 0) -
                    BigInt(userDistributionInfo?.flowRate ?? 0)) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">All</Card.Text>
          <Badge className="bg-secondary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(
              Number(
                formatEther(
                  BigInt(matchingPool?.flowRate ?? 0) *
                    BigInt(SECONDS_IN_MONTH),
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20 mt-4">
          monthly
        </Card.Text>
      </Stack>
      <Stack direction="horizontal" gap={1} className="fs-6 p-2">
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-primary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(Number(formatEther(totalDistributedUser)))}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-info rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(
              Number(formatEther(totalDistributedAll - totalDistributedUser)),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Badge className="bg-secondary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumber(Number(formatEther(totalDistributedAll)))}
          </Badge>
        </Stack>
        <Card.Text as="small" className="w-20">
          total
        </Card.Text>
      </Stack>
      <Card.Text className="m-0 p-2 fs-6" style={{ maxWidth: 500 }}>
        Support the Flow State Core by opening a stream to the team distribution
        pool. Funds are split evenly between the contributors.
        <br />
        <br />
        <Card.Link
          href="https://docs.google.com/forms/d/e/1FAIpQLSdIIt9mUJTvc-4dOtpgYSTg9DMnT-jccfTCWEzyioEF5vXVDQ/viewform"
          target="_blank"
          className="text-primary text-decoration-none"
        >
          Become a coop member
        </Card.Link>{" "}
        and start earning patronage for supporting public goods like us on the
        Flow State platform.
      </Card.Text>
    </Stack>
  );
}
