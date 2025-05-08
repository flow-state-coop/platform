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
import useCouncil from "../hooks/council";
import useFlowingAmount from "@/hooks/flowingAmount";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type PoolInfoProps = {
  name: string;
  description: string;
  chainId: number;
  distributionTokenInfo: Token;
  gdaPool?: GDAPool;
  showDistributionPoolFunding: () => void;
};

export default function PoolInfo(props: PoolInfoProps) {
  const {
    name,
    description,
    chainId,
    distributionTokenInfo,
    gdaPool,
    showDistributionPoolFunding,
  } = props;

  const [showFullInfo, setShowFullInfo] = useState(true);

  const { council } = useCouncil();
  const { isMobile } = useMediaQuery();
  const { address } = useAccount();

  const distributionMonthly =
    BigInt(gdaPool?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH);
  const distributionTotal = useFlowingAmount(
    BigInt(gdaPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0),
    gdaPool?.updatedAtTimestamp ?? 0,
    BigInt(gdaPool?.flowRate ?? 0),
  );
  const grantee = council?.grantees.find(
    (grantee) => grantee.account === address?.toLowerCase(),
  );

  useLayoutEffect(() => {
    if (!showFullInfo) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [showFullInfo]);

  return (
    <div
      className="px-4 pt-5 pool-info-background"
      style={{ maxWidth: "100vw" }}
    >
      <Stack direction="vertical" className="pb-4">
        <Stack direction="horizontal" className="justify-content-between align-items-center mb-2">
          <Stack direction="horizontal" gap={1}>
            <Card.Text className="m-0 fs-4 fw-bold">{name}</Card.Text>
            <InfoTooltip
              content=<>
                {removeMarkdown(description).replace(/\r?\n|\r/g, " ")}
              </>
              target={
                <Image
                  src="/info.svg"
                  alt="description"
                  width={20}
                  className="mb-4"
                />
              }
            />
          </Stack>
          
          {(!isMobile || showFullInfo) && (
            <Button
              variant="secondary"
              className="p-2 text-light"
              style={{ width: "auto" }}
              onClick={showDistributionPoolFunding}
            >
              Grow the Pie
            </Button>
          )}
          
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
        <Card.Text className="mb-4 fs-6">Flow Council Allocation</Card.Text>
        {(!isMobile || showFullInfo) && (
          <>
            <Table borderless>
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
                  <th className="w-25 bg-transparent text-dark">Recipients</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="w-25 ps-0 bg-transparent">
                    {distributionTokenInfo.symbol}
                  </td>
                  <td className="w-25 bg-transparent">
                    {Intl.NumberFormat("en", {
                      notation:
                        Number(formatEther(distributionMonthly)) >= 1000
                          ? "compact"
                          : void 0,
                      maximumFractionDigits:
                        Number(formatEther(distributionMonthly)) < 1
                          ? 4
                          : Number(formatEther(distributionMonthly)) < 10
                            ? 3
                            : Number(formatEther(distributionMonthly)) < 100
                              ? 2
                              : 1,
                    }).format(Number(formatEther(distributionMonthly)))}
                  </td>
                  <td className="w-25 bg-transparent">
                    {Intl.NumberFormat("en", {
                      notation:
                        Number(formatEther(distributionTotal)) >= 1000
                          ? "compact"
                          : void 0,
                      maximumFractionDigits:
                        Number(formatEther(distributionTotal)) < 1
                          ? 4
                          : Number(formatEther(distributionTotal)) < 10
                            ? 3
                            : Number(formatEther(distributionTotal)) < 100
                              ? 2
                              : 1,
                    }).format(Number(formatEther(distributionTotal)))}
                  </td>
                  <td className="w-25 bg-transparent">
                    {council?.grantees?.length ?? 0}
                  </td>
                </tr>
              </tbody>
            </Table>
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={4}
              className="justify-content-end w-100 mt-3"
            >
              {grantee && (
                <Button
                  variant="link"
                  href={`https://flowstate.network/projects/${grantee.metadata}/?chainId=${chainId}&edit=true`}
                  target="_blank"
                  className="bg-primary p-2 text-light fs-5 text-decoration-none"
                  style={{ width: isMobile ? "100%" : 180 }}
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
      </Stack>
    </div>
  );
}
