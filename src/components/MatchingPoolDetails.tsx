import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useClampText } from "use-clamp-text";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import { MatchingPool } from "@/types/matchingPool";
import { Token } from "@/types/token";
import useFlowingAmount from "@/hooks/flowingAmount";
import { roundWeiAmount, formatNumberWithCommas } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

interface MatchingPoolDetailsProps {
  poolName: string;
  description: string;
  matchingPool: MatchingPool;
  matchingTokenInfo: Token;
}

export default function MatchingPoolDetails(props: MatchingPoolDetailsProps) {
  const { poolName, description, matchingPool, matchingTokenInfo } = props;

  const [readMore, setReadMore] = useState(true);

  const { address } = useAccount();
  const [descriptionRef, { clampedText }] = useClampText({
    text: description,
    ellipsis: "...",
    expanded: readMore,
  });

  const flowRateToReceiver = useMemo(() => {
    if (address && matchingPool) {
      const distributor = matchingPool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return distributor.flowRate;
      }
    }

    return "0";
  }, [address, matchingPool]);

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
        <Card className="bg-transparent border-0 ms-3">
          <Card.Title className="fs-6 text-secondary">{poolName}</Card.Title>
          <Card.Subtitle className="mb-0 fs-6">
            Your Current Stream
          </Card.Subtitle>
          <Card.Body className="d-flex align-items-center gap-2 p-0">
            {address && !flowRateToReceiver ? (
              <Spinner
                animation="border"
                role="status"
                className="mx-auto mt-3 p-3"
              ></Spinner>
            ) : (
              <>
                <Card.Text as="span" className="fs-1">
                  {formatNumberWithCommas(
                    parseFloat(
                      roundWeiAmount(
                        BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
                        4,
                      ),
                    ),
                  )}
                </Card.Text>
                <Card.Text as="small" className="mt-1">
                  {matchingTokenInfo.name} <br />
                  per <br />
                  month
                </Card.Text>
              </>
            )}
          </Card.Body>
        </Card>
      </Stack>
      <Stack direction="horizontal" className="text-info fs-5 p-2">
        Details
        <Button
          variant="link"
          href={"https://streaming.fund"}
          target="_blank"
          rel="noreferrer"
          className="ms-2 p-0"
        >
          <Image src="/web.svg" alt="Web" width={18} />
        </Button>
        <Button
          variant="link"
          href="https://twitter.com/thegeoweb"
          target="_blank"
          rel="noreferrer"
          className="ms-1 p-0"
        >
          <Image src="/x-logo.svg" alt="X Social Network" width={12} />
        </Button>
      </Stack>
      <Stack direction="horizontal" gap={1} className="fs-6 p-2">
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">You</Card.Text>
          <Badge className="bg-primary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumberWithCommas(
              parseFloat(formatEther(totalDistributedUser).slice(0, 8)),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">All</Card.Text>
          <Badge className="bg-secondary rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumberWithCommas(
              parseFloat(formatEther(totalDistributedAll).slice(0, 8)),
            )}
          </Badge>
        </Stack>
        <Stack direction="vertical" gap={1} className="w-25">
          <Card.Text className="m-0 pe-0">Others</Card.Text>
          <Badge className="bg-info rounded-1 p-1 text-start fs-6 fw-normal">
            {formatNumberWithCommas(
              parseFloat(
                formatEther(totalDistributedAll - totalDistributedUser).slice(
                  0,
                  8,
                ),
              ),
            )}
          </Badge>
        </Stack>
        <Card.Text as="small" className="mt-4">
          total
        </Card.Text>
      </Stack>
      <Card.Text
        ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
        className="m-0 p-2 fs-6"
        style={{ maxWidth: 500 }}
      >
        {clampedText}
      </Card.Text>
      <Button
        variant="transparent"
        className="p-0 border-0 shadow-none"
        onClick={() => setReadMore(!readMore)}
      >
        <Image
          src={readMore ? "/expand-less.svg" : "/expand-more.svg"}
          alt="expand"
          width={18}
        />
      </Button>
    </Stack>
  );
}
