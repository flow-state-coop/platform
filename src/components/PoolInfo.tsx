import { useState, useLayoutEffect } from "react";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import InfoTooltip from "@/components/InfoTooltip";
import { roundWeiAmount } from "@/lib/utils";
import { Pool } from "@/types/pool";
import { MatchingPool } from "@/types/matchingPool";
import { Token } from "@/types/token";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type PoolInfoProps = Pool & {
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  directFlowRate: bigint;
  directTotal: bigint;
  directFunders: number;
  matchingPool: MatchingPool;
  showTransactionPanel: () => void;
};

export default function PoolInfo(props: PoolInfoProps) {
  const {
    name,
    description,
    allocationTokenInfo,
    matchingTokenInfo,
    directFlowRate,
    directTotal,
    directFunders,
    matchingPool,
    showTransactionPanel,
  } = props;

  const [showFullInfo, setShowFullInfo] = useState(false);

  const { isMobile } = useMediaQuery();

  const directMonthly = directFlowRate * BigInt(SECONDS_IN_MONTH);
  const matchingMonthly =
    BigInt(matchingPool?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH);
  const matchingTotal = useFlowingAmount(
    BigInt(matchingPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0),
    matchingPool?.updatedAtTimestamp ?? 0,
    BigInt(matchingPool?.flowRate ?? 0),
  );

  useLayoutEffect(() => {
    if (!showFullInfo) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [showFullInfo]);

  return (
    <Stack direction="vertical" className="p-5 pb-4 border-bottom">
      <Stack direction="horizontal" className="justify-content-between">
        <Stack direction="horizontal" gap={1}>
          <Card.Text className="m-0 fs-4 fw-bold">{name}</Card.Text>
          <InfoTooltip
            content=<>{description}</>
            target={
              <Image
                src="/info.svg"
                alt="description"
                width={16}
                className="mb-4"
              />
            }
          />
        </Stack>
        {isMobile && !showFullInfo && (
          <Button
            variant="transparent"
            className="p-0"
            onClick={() => setShowFullInfo(true)}
          >
            <Image src="/expand-more.svg" alt="toggle" width={48} />
          </Button>
        )}
      </Stack>
      {(!isMobile || showFullInfo) && (
        <>
          <Stack direction="horizontal" gap={5} className="flex-wrap m-5 mt-3">
            <Stack
              direction="vertical"
              className="align-items-center justify-content-center"
            >
              <Card.Text className="m-0 fs-3">
                {roundWeiAmount(directTotal, 2)} {allocationTokenInfo.name}
              </Card.Text>
              <Card.Text className="m-0">Total Direct Funding</Card.Text>
            </Stack>
            <Stack
              direction="vertical"
              className="align-items-center justify-content-center"
            >
              <Card.Text className="m-0 fs-3">
                {roundWeiAmount(directMonthly, 2)} {allocationTokenInfo.name}
              </Card.Text>
              <Card.Text className="m-0 text-nowrap">
                Monthly Direct Funding
              </Card.Text>
            </Stack>
            <Stack
              direction="vertical"
              className="align-items-center justify-content-center"
            >
              <Card.Text className="m-0 fs-3">{directFunders}</Card.Text>
              <Card.Text className="m-0">Direct Funders</Card.Text>
            </Stack>
          </Stack>
          <Stack
            direction="horizontal"
            gap={5}
            className="flex-wrap justify-content-center"
          >
            <Stack
              direction="vertical"
              className="align-self-start align-items-center flex-grow-0 me-0 me-sm-5"
            >
              <Card.Text className="m-0 fs-3">
                {roundWeiAmount(matchingTotal, 2)} {matchingTokenInfo.name}
              </Card.Text>
              <Card.Text className="m-0">Total Matching</Card.Text>
            </Stack>
            <Stack
              direction="vertical"
              className="align-items-center flex-grow-0 ms-0 ms-sm-5"
            >
              <Card.Text className="m-0 fs-3">
                {roundWeiAmount(matchingMonthly, 2)} {matchingTokenInfo.name}
              </Card.Text>
              <Card.Text className="m-0">Monthly Matching</Card.Text>
              <Button
                variant="success"
                className="mt-3 p-2"
                style={{ width: 128 }}
                onClick={showTransactionPanel}
              >
                <Image
                  src="/add.svg"
                  alt="fund"
                  width={24}
                  style={{
                    filter:
                      "invert(98%) sepia(4%) saturate(112%) hue-rotate(260deg) brightness(118%) contrast(100%)",
                  }}
                />
              </Button>
            </Stack>
          </Stack>
        </>
      )}
      {isMobile && showFullInfo && (
        <Button
          variant="transparent"
          className="p-0 ms-auto mt-5"
          onClick={() => setShowFullInfo(false)}
        >
          <Image src="/expand-less.svg" alt="toggle" width={48} />
        </Button>
      )}
    </Stack>
  );
}
