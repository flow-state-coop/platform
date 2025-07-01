import { useState, useLayoutEffect } from "react";
import { Address, formatEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import removeMarkdown from "remove-markdown";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Table from "react-bootstrap/Table";
import InfoTooltip from "@/components/InfoTooltip";
import { GDAPool } from "@/types/gdaPool";
import { Token } from "@/types/token";
import { councilAbi } from "@/lib/abi/council";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "@/app/flow-councils/hooks/council";
import useFlowingAmount from "@/hooks/flowingAmount";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type PoolInfoProps = {
  name: string;
  description: string;
  chainId: number;
  councilAddress: string;
  distributionTokenInfo: Token;
  gdaPool?: GDAPool;
  showDistributionPoolFunding: () => void;
};

export default function PoolInfo(props: PoolInfoProps) {
  const {
    name,
    description,
    chainId,
    councilAddress,
    distributionTokenInfo,
    gdaPool,
    showDistributionPoolFunding,
  } = props;

  const [showFullInfo, setShowFullInfo] = useState(true);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);

  const { council, dispatchNewAllocation } = useCouncil();
  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const {
    data: votingPower,
    refetch: refetchVotingPower,
    isPending: isVotingPowerQueryPending,
  } = useReadContract({
    abi: councilAbi,
    address: councilAddress as Address,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: !!address },
  });

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

  const checkEligibility = async () => {
    if (!address && openConnectModal) {
      openConnectModal();

      return;
    }

    setIsCheckingEligibility(true);

    try {
      const eligibilityRes = await fetch("/api/good-dollar/eligibility", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          address,
        }),
      });

      const { success } = await eligibilityRes.json();

      if (success) {
        await refetchVotingPower();
      }
    } catch (err) {
      console.error(err);
    }

    setIsCheckingEligibility(false);
    setHasCheckedEligibility(true);
  };

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
                    {formatNumber(Number(formatEther(distributionMonthly)))}
                  </td>
                  <td className="w-25 bg-transparent">
                    {formatNumber(Number(formatEther(distributionTotal)))}
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
                style={{ width: isMobile ? "100%" : 256 }}
                onClick={showDistributionPoolFunding}
              >
                Grow the Pie
              </Button>
              {grantee ? (
                <Button
                  variant="link"
                  href={`https://flowstate.network/projects/${grantee.metadata}/?chainId=${chainId}&edit=true`}
                  target="_blank"
                  className="bg-primary p-2 text-light fs-5 text-decoration-none"
                  style={{ width: isMobile ? "100%" : 256 }}
                >
                  Edit Builder Profile
                </Button>
              ) : votingPower ? (
                <Button
                  variant={hasCheckedEligibility ? "success" : "primary"}
                  className="d-flex gap-2 justify-content-center align-items-center p-2 text-light fs-5 text-decoration-none"
                  style={{ width: isMobile ? "100%" : 256 }}
                  onClick={() => dispatchNewAllocation({ type: "show-ballot" })}
                >
                  {hasCheckedEligibility && (
                    <Image
                      src="check-circle.svg"
                      alt=""
                      width={24}
                      height={24}
                      style={{
                        filter:
                          "brightness(0) saturate(100%) invert(99%) sepia(10%) saturate(48%) hue-rotate(174deg) brightness(120%) contrast(100%)",
                      }}
                    />
                  )}
                  View Ballot
                </Button>
              ) : hasCheckedEligibility ? (
                <Button
                  variant="link"
                  href="https://goodwallet.xyz"
                  target="_blank"
                  className="bg-primary p-2 text-light fs-5 text-decoration-none"
                  style={{ width: isMobile ? "100%" : 256 }}
                >
                  Join to Vote
                </Button>
              ) : (
                <Button
                  className="bg-primary p-2 text-light fs-5 text-decoration-none"
                  onClick={checkEligibility}
                  style={{
                    width: isMobile ? "100%" : 256,
                    pointerEvents: isCheckingEligibility ? "none" : "auto",
                  }}
                >
                  {address &&
                  (isCheckingEligibility || isVotingPowerQueryPending) ? (
                    <Spinner size="sm" />
                  ) : (
                    "Check Voter Eligibility"
                  )}
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
