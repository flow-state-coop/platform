import { useState, useLayoutEffect } from "react";
import { Address, formatEther } from "viem";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import removeMarkdown from "remove-markdown";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Modal from "react-bootstrap/Modal";
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
import { networks } from "@/lib/networks";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type RoundBannerProps = {
  name: string;
  description: string;
  chainId: number;
  councilAddress: string;
  distributionTokenInfo: Token;
  gdaPool?: GDAPool;
  showDistributionPoolFunding: () => void;
};

export default function RoundBanner(props: RoundBannerProps) {
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
  const [showInstructions, setShowInstructions] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);

  const { council, dispatchShowBallot } = useCouncil();
  const { isMobile } = useMediaQuery();
  const { switchChain } = useSwitchChain();
  const { address, chain: connectedChain } = useAccount();
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
  const superfluidExplorer = networks.find(
    (network) => network.id === chainId,
  )?.superfluidExplorer;

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

    if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
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
      <Button
        variant="transparent"
        className="p-0 shadow-none border-0"
        onClick={() => setShowInstructions(true)}
      >
        <Card.Text className="mb-8 fs-lg fw-semi-bold text-primary text-start">
          How to participate (& earn $SUP)
        </Card.Text>
      </Button>
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
                    href={`${superfluidExplorer}/pools/${gdaPool?.id}`}
                    target="_blank"
                  >
                    {formatNumber(Number(formatEther(distributionMonthly)))}
                  </Card.Link>
                </td>
                <td className="w-25 bg-transparent">
                  {formatNumber(Number(formatEther(distributionTotal)))}
                </td>
                <td className="w-25 bg-transparent">
                  {formatNumber(gdaPool?.poolDistributors.length ?? 0)}
                </td>
              </tr>
            </tbody>
          </Table>
          <Stack
            direction={isMobile ? "vertical" : "horizontal"}
            gap={4}
            className="justify-content-end w-100 mt-8"
          >
            <Button
              variant="secondary"
              className="py-4 rounded-4 fs-lg fw-semi-bold text-light"
              style={{ width: isMobile ? "100%" : 240 }}
              onClick={showDistributionPoolFunding}
            >
              Grow the Pie
            </Button>
            {grantee ? (
              <Button
                variant="link"
                href={`https://flowstate.network/projects/${grantee.metadata}/?chainId=${chainId}&edit=true`}
                target="_blank"
                className="bg-primary py-4 rounded-4 text-light fs-lg fw-semi-bold text-decoration-none"
                style={{ width: isMobile ? "100%" : 240 }}
              >
                Edit Builder Profile
              </Button>
            ) : votingPower ? (
              <Button
                variant={hasCheckedEligibility ? "success" : "primary"}
                className="d-flex gap-2 justify-content-center align-items-center py-4 rounded-4 fs-lg text-light fw-semi-bold text-decoration-none"
                style={{ width: isMobile ? "100%" : 256 }}
                onClick={() => dispatchShowBallot({ type: "show" })}
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
                className="bg-primary py-4 rounded-4 fs-lg fw-semi-bold text-light text-decoration-none"
                style={{ width: isMobile ? "100%" : 256 }}
              >
                Join to Vote
              </Button>
            ) : (
              <Button
                className="bg-primary py-4 rounded-4 text-light fs-lg fw-semi-bold text-decoration-none"
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
      {showInstructions && (
        <Modal
          show={showInstructions}
          centered
          size="lg"
          onHide={() => setShowInstructions(false)}
          contentClassName="p-4"
        >
          <Modal.Header closeButton className="align-items-start border-0">
            <Modal.Title className="fs-5 fw-semi-bold">
              How to participate (and earn $SUP)
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="fs-lg">
            <ul>
              <li>
                GoodBuilders Round 2 is a continuous funding round. $85k in G$
                will be dynamically allocated to builders by community vote
                between now and October 9!
              </li>
              <li className="mt-3">
                Earn votes by{" "}
                <Card.Link
                  href="https://goodwallet.xyz"
                  target="_blank"
                  className="text-primary"
                >
                  becoming a verified G$
                </Card.Link>{" "}
                user or opening a G$ stream to “Grow the Pie”.
              </li>
              <ul className="mt-2">
                <li>
                  Additional votes are distributed at the start of every
                  two-week epoch (July 9th, July 23rd, ...).
                </li>
              </ul>
              <li className="mt-3">
                Earn Superfluid XP by voting in each epoch and/or maintaining a
                donation stream.
              </li>
              <ul className="mt-2">
                <li>
                  Claim your share of a{" "}
                  <Card.Link
                    href="https://claim.superfluid.org"
                    target="_blank"
                    className="text-primary"
                  >
                    1M $SUP rewards stream
                  </Card.Link>{" "}
                  anytime you earn XP.
                </li>
              </ul>
              <li className="mt-3">Don't have G$ to donate?</li>
              <ul className="mt-2">
                <li>
                  <Card.Link
                    href="https://goodwallet.xyz"
                    target="_blank"
                    className="text-primary"
                  >
                    Get verified and claim your daily G$ UBI
                  </Card.Link>
                  , then "Grow the Pie" with a donation stream. UBI is roughly
                  60 G$/day. With daily claims, you can stream ~1,800 G$/month.
                </li>
              </ul>
              <ul className="mt-2">
                <li>
                  Buy more G$ on the{" "}
                  <Card.Link
                    href="https://gooddapp.org/#/swap/celoReserve"
                    target="_blank"
                    className="text-primary"
                  >
                    GoodApp
                  </Card.Link>{" "}
                  or{" "}
                  <Card.Link
                    href="https://app.uniswap.org"
                    target="_blank"
                    className="text-primary"
                  >
                    Uniswap
                  </Card.Link>
                  .
                </li>
              </ul>
              <li className="mt-3">
                Ready to become a GoodBuilder?{" "}
                <Card.Link
                  href="https://ubi.gd/4epiAwf"
                  target="_blank"
                  className="text-primary"
                >
                  Read
                </Card.Link>{" "}
                &{" "}
                <Card.Link
                  href="https://flowstate.network/gooddollar/grantee"
                  target="_blank"
                  className="text-primary"
                >
                  apply
                </Card.Link>
                .
              </li>
            </ul>
          </Modal.Body>
          <Modal.Footer className="border-0">
            <Button
              className="px-10 py-4 rounded-4 fw-semi-bold"
              onClick={() => setShowInstructions(false)}
            >
              Let's Go
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}
