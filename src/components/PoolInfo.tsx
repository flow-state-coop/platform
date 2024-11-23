import { useState, useLayoutEffect } from "react";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Table from "react-bootstrap/Table";
import InfoTooltip from "@/components/InfoTooltip";
import Markdown from "react-markdown";
import rehyperExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import { Pool } from "@/types/pool";
import { GDAPool } from "@/types/gdaPool";
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
  matchingPool: GDAPool;
  supervisualUrl: string;
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
    supervisualUrl,
    showTransactionPanel,
  } = props;

  const [showFullInfo, setShowFullInfo] = useState(true);

  const { isMobile } = useMediaQuery();

  const directMonthly = directFlowRate * BigInt(SECONDS_IN_MONTH);
  const matchingMonthly =
    BigInt(matchingPool?.flowRate ?? 0) * BigInt(SECONDS_IN_MONTH);
  const matchingTotal = useFlowingAmount(
    BigInt(matchingPool?.totalAmountFlowedDistributedUntilUpdatedAt ?? 0),
    matchingPool?.updatedAtTimestamp ?? 0,
    BigInt(matchingPool?.flowRate ?? 0),
  );
  const matchingPoolFunders =
    matchingPool?.poolDistributors?.filter(
      (distributor) => distributor.flowRate !== "0",
    ).length ?? 0;

  useLayoutEffect(() => {
    if (!showFullInfo) {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [showFullInfo]);

  return (
    <div className="px-4 pt-5 pool-info-background">
      <Stack direction="vertical" className="pb-4">
        <Stack direction="horizontal" className="justify-content-between">
          <Stack direction="horizontal" gap={1}>
            <Card.Text className="m-0 fs-4 fw-bold">{name}</Card.Text>
            <InfoTooltip
              content={
                <Markdown
                  className="p-2"
                  skipHtml={true}
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    [
                      rehyperExternalLinks,
                      { target: "_blank", properties: { class: "text-light" } },
                    ],
                  ]}
                >
                  {description}
                </Markdown>
              }
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
        <Card.Text className="mb-4 fs-6">Streaming Quadratic Funding</Card.Text>
        {(!isMobile || showFullInfo) && (
          <>
            <Table borderless>
              <thead className="border-bottom border-dark">
                <tr>
                  <th className="w-33 ps-0 bg-transparent text-dark">
                    {isMobile ? "Token" : "Funding Types (Token)"}
                  </th>
                  <th className="w-20 bg-transparent text-dark">
                    {isMobile ? "Total" : "Total Flow"}
                  </th>
                  <th className="w-20 bg-transparent text-dark">
                    {isMobile ? "Monthly" : "Monthly Flow"}
                  </th>
                  <th className="w-20 bg-transparent text-dark">
                    {isMobile ? "Funders" : "Active Funders"}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="w-33 ps-0 bg-transparent">
                    Direct ({allocationTokenInfo.name})
                  </td>
                  <td className="w-20 bg-transparent">
                    {Number(formatEther(directTotal)).toFixed(isMobile ? 4 : 6)}
                  </td>
                  <td className="w-20 bg-transparent">
                    {Number(formatEther(directMonthly)).toFixed(4)}
                  </td>
                  <td className="w-20 bg-transparent">{directFunders}</td>
                </tr>
                <tr>
                  <td className="w-33 ps-0 bg-transparent">
                    Matching ({matchingTokenInfo.name})
                  </td>
                  <td className="w-20 bg-transparent">
                    {Number(formatEther(matchingTotal)).toFixed(
                      isMobile ? 4 : 6,
                    )}
                  </td>
                  <td className="w-20 bg-transparent">
                    {Number(formatEther(matchingMonthly)).toFixed(4)}
                  </td>
                  <td className="w-20 bg-transparent">{matchingPoolFunders}</td>
                </tr>
              </tbody>
            </Table>
            <Stack
              direction={isMobile ? "vertical" : "horizontal"}
              gap={4}
              className="justify-content-end w-100 mt-3"
            >
              <Button
                className="p-2 text-light fs-5"
                style={{ width: isMobile ? "100%" : 180 }}
                onClick={showTransactionPanel}
              >
                Grow the Pie
              </Button>
              <Button
                variant="link"
                href={supervisualUrl}
                target="_blank"
                className="bg-secondary p-2 text-light fs-5 text-decoration-none"
                style={{ width: isMobile ? "100%" : 180 }}
              >
                View Flow State
              </Button>
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
