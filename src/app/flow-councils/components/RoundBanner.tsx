import { useState, useLayoutEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
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
import { formatNumberWithCharSuffix } from "@/lib/utils";
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
        <Stack direction="horizontal" className="justify-content-between">
          <Stack direction="horizontal" gap={1}>
            <Card.Text className="m-0 fs-4 fw-bold">{name}</Card.Text>
            <InfoTooltip
              content=<>{description}</>
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
                    {distributionTokenInfo.name}
                  </td>
                  <td className="w-25 bg-transparent">
                    {formatNumberWithCharSuffix(
                      Number(formatEther(distributionMonthly)),
                      0,
                    )}
                  </td>
                  <td className="w-25 bg-transparent">
                    {formatNumberWithCharSuffix(
                      Number(formatEther(distributionTotal)),
                      4,
                    )}
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
              <Button
                variant="secondary"
                className="p-2 text-light fs-5"
                style={{ width: isMobile ? "100%" : 180 }}
                onClick={showDistributionPoolFunding}
              >
                Grow the Pie
              </Button>
              {grantee && (
                <Button
                  variant="link"
                  href={`https://flowstate.network/projects/${grantee.metadata}/?chainId=${chainId}&edit=true`}
                  target="_blank"
                  className="bg-primary p-2 text-light fs-5"
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
