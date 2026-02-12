import { useState, useLayoutEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import removeMarkdown from "remove-markdown";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Table from "react-bootstrap/Table";
import InfoTooltip from "@/components/InfoTooltip";
import { GDAPool } from "@/types/gdaPool";
import { Token } from "@/types/token";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowCouncil from "../hooks/flowCouncil";
import useFlowingAmount from "@/hooks/flowingAmount";
import { networks } from "@/lib/networks";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import EligibilityButton from "./EligibilityButton";

type PoolInfoProps = {
  name: string;
  description: string;
  chainId: number;
  councilId: string;
  distributionTokenInfo: Token;
  distributionPool?: GDAPool;
  showDistributionPoolFunding: () => void;
};

export default function PoolInfo(props: PoolInfoProps) {
  const {
    name,
    description,
    chainId,
    councilId,
    distributionTokenInfo,
    distributionPool,
    showDistributionPoolFunding,
  } = props;

  const [showFullInfo, setShowFullInfo] = useState(true);

  const { council, superAppFunderData } = useFlowCouncil();
  const { isMobile } = useMediaQuery();
  const { address } = useAccount();

  const poolFlowRate = superAppFunderData
    ? BigInt(superAppFunderData.totalInflowRate)
    : BigInt(distributionPool?.flowRate ?? 0);
  const poolMonthly = poolFlowRate * BigInt(SECONDS_IN_MONTH);
  const poolTotal = useFlowingAmount(
    superAppFunderData
      ? BigInt(superAppFunderData.totalAmountStreamedInUntilUpdatedAt)
      : BigInt(
          distributionPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
        ),
    superAppFunderData
      ? superAppFunderData.updatedAtTimestamp
      : (distributionPool?.updatedAtTimestamp ?? 0),
    poolFlowRate,
  );
  const funderCount = superAppFunderData
    ? superAppFunderData.funderCount
    : (distributionPool?.poolDistributors.length ?? 0);
  const recipient = council?.recipients.find(
    (recipient: { account: string }) =>
      recipient.account === address?.toLowerCase(),
  );
  const superfluidExplorer = networks.find(
    (network) => network.id === chainId,
  )?.superfluidExplorer;

  useLayoutEffect(() => {
    if (!showFullInfo) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [showFullInfo]);

  return (
    <div
      className="px-8 py-6 pool-info-background rounded-5"
      style={{ maxWidth: "100vw" }}
    >
      <Stack
        direction="horizontal"
        className="justify-content-between align-items-center mb-2"
      >
        <Stack direction="horizontal" gap={1}>
          <Card.Text className="m-0 fs-3 fw-semi-bold">{name}</Card.Text>
          <InfoTooltip
            content=<p className="m-0 p-2">
              {removeMarkdown(description).replace(/\r?\n|\r/g, " ")}
            </p>
            target={
              <Image
                src="/info.svg"
                alt="description"
                width={24}
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
      <Card.Text className="mb-8 fs-lg">Flow Council Allocation</Card.Text>
      {(!isMobile || showFullInfo) && (
        <>
          <Table borderless className="fs-lg">
            <thead className="border-bottom border-dark">
              <tr>
                <th className="w-25 ps-0 bg-transparent text-dark">
                  {isMobile ? "Token" : "Funding Token"}
                </th>
                <th className="w-25 bg-transparent text-dark">
                  {isMobile ? "Monthly" : "Monthly Flow"}
                </th>
                <th className="w-25 bg-transparent text-dark">
                  {isMobile ? "Total" : "Total Flow"}
                </th>
                <th className="w-25 bg-transparent text-dark">Funders</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="w-25 ps-0 bg-transparent">
                  {distributionTokenInfo.symbol}
                </td>
                <td className="w-25 bg-transparent">
                  <Card.Link
                    href={`${superfluidExplorer}/pools/${distributionPool?.id}`}
                    target="_blank"
                  >
                    {formatNumber(Number(formatEther(poolMonthly)))}
                  </Card.Link>
                </td>
                <td className="w-25 bg-transparent">
                  {formatNumber(Number(formatEther(poolTotal)))}
                </td>
                <td className="w-25 bg-transparent">
                  {formatNumber(funderCount)}
                </td>
              </tr>
            </tbody>
          </Table>
          <Stack
            direction={isMobile ? "vertical" : "horizontal"}
            gap={4}
            className="justify-content-end w-100 mt-8"
          >
            {(!isMobile || showFullInfo) && (
              <Button
                variant="secondary"
                className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
                style={{ width: isMobile ? "100%" : 240 }}
                onClick={showDistributionPoolFunding}
              >
                Grow the Pie
              </Button>
            )}
            <EligibilityButton
              chainId={chainId}
              councilId={councilId}
              isMobile={isMobile}
            />
            {recipient && (
              <Button
                variant="link"
                href={`https://flowstate.network/projects/${recipient.metadata}/?chainId=${chainId}&edit=true`}
                target="_blank"
                className="bg-primary py-4 text-light rounded-4 fs-lg fw-semi-bold text-decoration-none"
                style={{ width: isMobile ? "100%" : 240 }}
              >
                Edit Builder Profile
              </Button>
            )}
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
    </div>
  );
}
