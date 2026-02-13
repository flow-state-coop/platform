"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import Dropdown from "react-bootstrap/Dropdown";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import GranteeCard from "@/app/flow-councils/components/GranteeCard";
import FeedTab from "@/app/flow-councils/components/FeedTab";
import RoundBanner from "@/app/flow-councils/components/RoundBanner";
import GranteeDetails from "@/app/flow-councils/components/GranteeDetails";
import Ballot from "@/app/flow-councils/components/Ballot";
import DistributionPoolFunding from "@/app/flow-councils/components/DistributionPoolFunding";
import VoteBubble from "@/app/flow-councils/components/VoteBubble";
import { Grantee, SortingMethod } from "../../types/grantee";
import { ProjectDetails } from "@/types/project";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowCouncil from "../../hooks/flowCouncil";
import useAnimateVoteBubble from "../../hooks/animateVoteBubble";
import { networks } from "@/lib/networks";
import { shuffle, getPlaceholderImageSrc, generateColor } from "@/lib/utils";

export default function FlowCouncil({
  chainId,
  councilId,
  csfrToken,
}: {
  chainId: number;
  councilId: string;
  csfrToken: string;
}) {
  const [selectedTab, setSelectedTab] = useState("grantees");
  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);
  const [showGranteeDetails, setShowGranteeDetails] = useState<Grantee | null>(
    null,
  );
  const [showDistributionPoolFunding, setShowDistributionPoolFunding] =
    useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const skipGrantees = useRef(0);
  const hasNextGrantee = useRef(true);

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];
  useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const {
    currentAllocation,
    newAllocation,
    council,
    councilMetadata,
    councilMember,
    projects,
    distributionPool,
    token,
    showBallot,
    dispatchNewAllocation,
  } = useFlowCouncil();
  const { voteBubbleRef, animateVoteBubble } = useAnimateVoteBubble();

  const poolMember = distributionPool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;
  const votingPower =
    !!address && councilMember?.votingPower ? councilMember.votingPower : 0;
  const currentAllocationStringified = JSON.stringify(currentAllocation);

  const getGrantee = useCallback(
    (recipient: { id: string; address: string; details: ProjectDetails }) => {
      const adjustedFlowRate =
        BigInt(distributionPool?.flowRate ?? 0) -
        BigInt(distributionPool?.adjustmentFlowRate ?? 0);
      const member = distributionPool?.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipient.address,
      );
      const memberUnits = member?.units ? Number(member.units) : 0;
      const memberFlowRate =
        BigInt(distributionPool?.totalUnits ?? 0) > 0
          ? (BigInt(memberUnits) * adjustedFlowRate) /
            BigInt(distributionPool?.totalUnits ?? 0)
          : BigInt(0);

      return {
        id: recipient.id,
        address: recipient.address as `0x${string}`,
        details: recipient.details,
        twitter: recipient.details.twitter ?? "",
        flowRate: memberFlowRate ?? BigInt(0),
        units: memberUnits,
        placeholderLogo: getPlaceholderImageSrc(),
        placeholderBanner: getPlaceholderImageSrc(),
      };
    },
    [distributionPool],
  );

  const sortGrantees = useCallback(
    (grantees: Grantee[]) => {
      if (sortingMethod === SortingMethod.RANDOM) {
        return shuffle(grantees);
      }

      if (sortingMethod === SortingMethod.ALPHABETICAL) {
        return grantees.sort((a, b) => {
          if ((a.details.name ?? "") < (b.details.name ?? "")) {
            return -1;
          }

          if ((a.details.name ?? "") > (b.details.name ?? "")) {
            return 1;
          }

          return 0;
        });
      }

      if (sortingMethod === SortingMethod.POPULAR) {
        return grantees.sort((a, b) => b.units - a.units);
      }

      return grantees;
    },
    [sortingMethod],
  );

  const granteeColors = useMemo(() => {
    if (grantees.length > 0) {
      const colorMap: Record<string, string> = {};

      grantees.forEach((grantee) => {
        colorMap[grantee.address] = generateColor(grantee.address + grantee.id);
      });

      return colorMap;
    }

    return {};
  }, [grantees]);

  useEffect(() => {
    dispatchNewAllocation({ type: "clear" });
  }, [address, dispatchNewAllocation]);

  useEffect(() => {
    const currentAllocation = JSON.parse(currentAllocationStringified);

    if (currentAllocation?.allocation) {
      dispatchNewAllocation({
        type: "add",
        currentAllocation,
      });
    }
  }, [currentAllocationStringified, dispatchNewAllocation]);

  useEffect(() => {
    if (!council || !projects) {
      return;
    }

    const hasGranteeBeenAddedOrRemoved =
      !hasNextGrantee.current &&
      skipGrantees.current !== council.recipients.length;

    if (hasGranteeBeenAddedOrRemoved) {
      hasNextGrantee.current = true;
      skipGrantees.current = 0;
    }

    if (hasNextGrantee.current) {
      const grantees: Grantee[] = [];

      for (let i = skipGrantees.current; i < council.recipients.length; i++) {
        skipGrantees.current = i + 1;

        if (skipGrantees.current === council.recipients.length) {
          hasNextGrantee.current = false;
        }

        const recipient = council.recipients[i];
        const project = projects.find(
          (p) =>
            p.fundingAddress.toLowerCase() === recipient?.account.toLowerCase(),
        );

        if (project && recipient) {
          grantees.push(
            getGrantee({
              id: project.id,
              address: recipient.account as `0x${string}`,
              details: project.details,
            }),
          );
        } else {
          break;
        }
      }

      setGrantees(sortGrantees(grantees));
    } else {
      setGrantees((prev) => {
        const grantees: Grantee[] = [];

        for (const i in prev) {
          grantees[i] = getGrantee({
            id: prev[i].id,
            address: prev[i].address as `0x${string}`,
            details: prev[i].details,
          });
        }

        return grantees;
      });
    }
  }, [
    council,
    projects,
    distributionPool,
    getGrantee,
    sortingMethod,
    sortGrantees,
  ]);

  useEffect(() => {
    if (address && connectedChain?.id !== chainId) {
      switchChain({ chainId });
    }
  }, [address, connectedChain, chainId, switchChain]);

  useEffect(() => {
    setGrantees((prev) => sortGrantees(prev));
  }, [sortingMethod, sortGrantees]);

  const clearUnallocated = () => {
    const zeroAllocations = newAllocation?.allocation.filter(
      (a) => a.amount === 0,
    );

    if (zeroAllocations) {
      for (const allocation of zeroAllocations) {
        dispatchNewAllocation({
          type: "delete",
          allocation,
        });
      }
    }
  };

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
        onMouseUp={clearUnallocated}
        onTouchEnd={clearUnallocated}
      >
        <RoundBanner
          name={councilMetadata.name ?? "Flow Council"}
          description={councilMetadata.description ?? "N/A"}
          chainId={chainId}
          distributionTokenInfo={token}
          distributionPool={distributionPool}
          showDistributionPoolFunding={() =>
            setShowDistributionPoolFunding(true)
          }
        />
        <Tab.Container
          activeKey={selectedTab}
          onSelect={(key) => setSelectedTab(key ?? "grantees")}
        >
          <Nav className="pt-8 pb-6 fs-6 gap-2">
            <Nav.Item>
              <Nav.Link
                eventKey="grantees"
                className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${selectedTab === "grantees" ? "bg-primary text-white" : "bg-white text-primary"}`}
                style={{ width: 140 }}
              >
                Grantees
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link
                eventKey="feed"
                className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${selectedTab === "feed" ? "bg-primary text-white" : "bg-white text-primary"}`}
                style={{ width: 140 }}
              >
                Feed
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey="grantees">
              <Dropdown className="pb-6">
                <Dropdown.Toggle
                  variant="transparent"
                  className="d-flex justify-content-between align-items-center border border-4 border-dark fw-semi-bold"
                  style={{ width: 156 }}
                >
                  {sortingMethod}
                </Dropdown.Toggle>
                <Dropdown.Menu className="p-2 lh-sm bg-white border border-4 border-dark">
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => setSortingMethod(SortingMethod.RANDOM)}
                  >
                    {SortingMethod.RANDOM}
                  </Dropdown.Item>
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => setSortingMethod(SortingMethod.ALPHABETICAL)}
                  >
                    {SortingMethod.ALPHABETICAL}
                  </Dropdown.Item>
                  <Dropdown.Item
                    className="fw-semi-bold"
                    onClick={() => setSortingMethod(SortingMethod.POPULAR)}
                  >
                    {SortingMethod.POPULAR}
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <Stack direction="vertical" className="flex-grow-0">
                <div
                  className="pb-5"
                  style={{
                    display: "grid",
                    columnGap: "1.5rem",
                    rowGap: "3rem",
                    gridTemplateColumns: isTablet
                      ? "repeat(2,minmax(0,1fr))"
                      : isSmallScreen
                        ? "repeat(3,minmax(0,1fr))"
                        : isMediumScreen || isBigScreen
                          ? "repeat(4,minmax(0,1fr))"
                          : "",
                  }}
                >
                  {grantees.map((grantee: Grantee) => (
                    <GranteeCard
                      key={`${grantee.address}-${grantee.id}`}
                      granteeAddress={grantee.address}
                      name={grantee.details.name ?? ""}
                      description={grantee.details.description ?? ""}
                      logoUrl={grantee.details.logoUrl ?? ""}
                      bannerUrl={grantee.details.bannerUrl ?? ""}
                      placeholderLogo={grantee.placeholderLogo}
                      placeholderBanner={grantee.placeholderBanner}
                      flowRate={grantee.flowRate}
                      units={grantee.units}
                      token={token}
                      votingPower={votingPower}
                      showGranteeDetails={() => setShowGranteeDetails(grantee)}
                      granteeColor={granteeColors[grantee.address]}
                      onAddToBallot={animateVoteBubble}
                    />
                  ))}
                </div>
                {hasNextGrantee.current === true && (
                  <Stack
                    direction="horizontal"
                    className="justify-content-center m-auto"
                  >
                    <Spinner />
                  </Stack>
                )}
              </Stack>
            </Tab.Pane>
            <Tab.Pane eventKey="feed">
              <FeedTab
                chainId={chainId}
                councilId={councilId}
                csfrToken={csfrToken}
              />
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </Stack>
      {showGranteeDetails ? (
        <GranteeDetails
          key={showGranteeDetails.id}
          id={showGranteeDetails.id}
          chainId={chainId}
          token={token}
          details={showGranteeDetails.details}
          placeholderLogo={showGranteeDetails.placeholderLogo}
          granteeAddress={showGranteeDetails.address}
          canAddToBallot={!!votingPower}
          hide={() => setShowGranteeDetails(null)}
        />
      ) : showDistributionPoolFunding ? (
        <DistributionPoolFunding
          network={network}
          hide={() => setShowDistributionPoolFunding(false)}
        />
      ) : showBallot ? (
        <Ballot councilAddress={councilId as Address} />
      ) : null}
      <Modal
        show={showConnectionModal}
        centered
        onHide={() => setShowConnectionModal(false)}
      >
        <Modal.Header
          closeButton
          className="align-items-start border-0 p-4 pb-0"
        >
          <Modal.Title className="fs-5 fw-bold">
            You're a recipient in this Flow Council but haven't connected.
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5 p-4">
          Do you want to do that now, so your{" "}
          <Link href="https://app.superfluid.finance/" target="_blank">
            Super Token balance
          </Link>{" "}
          is reflected in real time?
        </Modal.Body>
        <Modal.Footer className="border-0 p-4 pt-0">
          <PoolConnectionButton
            network={network}
            poolAddress={distributionPool?.id ?? "0x"}
            isConnected={!shouldConnect}
          />
        </Modal.Footer>
      </Modal>
      {newAllocation?.allocation && newAllocation.allocation.length > 0 && (
        <VoteBubble
          grantees={grantees}
          granteeColors={granteeColors}
          votingPower={votingPower}
          voteBubbleRef={voteBubbleRef}
        />
      )}
    </>
  );
}
