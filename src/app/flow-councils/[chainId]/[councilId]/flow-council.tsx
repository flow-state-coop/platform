"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import GranteeCard from "../../components/GranteeCard";
import RoundBanner from "../../components/RoundBanner";
import GranteeDetails from "../../components/GranteeDetails";
import Ballot from "../../components/Ballot";
import DistributionPoolFunding from "../../components/DistributionPoolFunding";
import InfoTooltip from "@/components/InfoTooltip";
import { ProjectMetadata } from "@/types/project";
import { Grantee, SortingMethod } from "../../types/grantee";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "../../hooks/council";
import { networks } from "@/lib/networks";
import { shuffle, getPlaceholderImageSrc, generateColor } from "@/lib/utils";

export default function FlowCouncil({
  chainId,
  councilId,
}: {
  chainId: number;
  councilId: string;
}) {
  const [grantees, setGrantees] = useState<Grantee[]>([]);
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);
  const [showGranteeDetails, setShowGranteeDetails] = useState<Grantee | null>(
    null,
  );
  const [showDistributionPoolFunding, setShowDistributionPoolFunding] =
    useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sharedPieData, setSharedPieData] = useState<any[]>([]);

  const skipGrantees = useRef(0);
  const hasNextGrantee = useRef(true);

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];
  useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const {
    currentAllocation,
    newAllocation,
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    dispatchNewAllocation,
  } = useCouncil();

  const poolMember = gdaPool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;
  const votingPower =
    !!address && currentAllocation?.votingPower
      ? currentAllocation.votingPower
      : 0;
  const currentAllocationStringified = JSON.stringify(currentAllocation);
  const totalAllocatedProjects =
    newAllocation?.allocation.filter((allocation) => allocation.amount !== 0)
      .length ?? 0;
  const totalAllocatedVotes =
    newAllocation?.allocation
      ?.map((allocation) => allocation.amount)
      .reduce((a, b) => a + b, 0) ?? 0;

  const getGrantee = useCallback(
    (recipient: { id: string; address: string; metadata: ProjectMetadata }) => {
      const adjustedFlowRate =
        BigInt(gdaPool?.flowRate ?? 0) -
        BigInt(gdaPool?.adjustmentFlowRate ?? 0);
      const member = gdaPool?.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipient.address,
      );
      const memberUnits = member?.units ? Number(member.units) : 0;
      const memberFlowRate =
        BigInt(gdaPool?.totalUnits ?? 0) > 0
          ? (BigInt(memberUnits) * adjustedFlowRate) /
            BigInt(gdaPool?.totalUnits ?? 0)
          : BigInt(0);

      return {
        id: recipient.id,
        address: recipient.address as `0x${string}`,
        metadata: recipient.metadata,
        bannerCid: recipient.metadata.bannerImg,
        twitter: recipient.metadata.projectTwitter,
        flowRate: memberFlowRate ?? BigInt(0),
        units: memberUnits,
        placeholderLogo: getPlaceholderImageSrc(),
        placeholderBanner: getPlaceholderImageSrc(),
      };
    },
    [gdaPool],
  );

  const sortGrantees = useCallback(
    (grantees: Grantee[]) => {
      if (sortingMethod === SortingMethod.RANDOM) {
        return shuffle(grantees);
      }

      if (sortingMethod === SortingMethod.ALPHABETICAL) {
        return grantees.sort((a, b) => {
          if (a.metadata.title < b.metadata.title) {
            return -1;
          }

          if (a.metadata.title > b.metadata.title) {
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
    const currentAllocation = JSON.parse(currentAllocationStringified);

    if (currentAllocation?.allocation) {
      dispatchNewAllocation({
        type: "add",
        currentAllocation,
        showBallot: false,
      });
    }
  }, [currentAllocationStringified, dispatchNewAllocation]);

  useEffect(() => {
    if (!council || !flowStateProfiles || !gdaPool) {
      return;
    }

    const hasGranteeBeenAddedOrRemoved =
      !hasNextGrantee.current &&
      skipGrantees.current !== council.grantees.length;

    if (hasGranteeBeenAddedOrRemoved) {
      hasNextGrantee.current = true;
      skipGrantees.current = 0;
    }

    if (hasNextGrantee.current) {
      const grantees: Grantee[] = [];

      for (let i = skipGrantees.current; i < council.grantees.length; i++) {
        skipGrantees.current = i + 1;

        if (skipGrantees.current === council.grantees.length) {
          hasNextGrantee.current = false;
        }

        const councilGrantee = council.grantees[i];
        const profile = flowStateProfiles.find(
          (profile: { id: string }) => profile.id === councilGrantee?.metadata,
        );

        if (profile && councilGrantee) {
          grantees.push(
            getGrantee({
              id: profile.id,
              address: councilGrantee.account as `0x${string}`,
              metadata: profile.metadata,
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
            metadata: prev[i].metadata,
          });
        }

        return grantees;
      });
    }
  }, [
    council,
    flowStateProfiles,
    gdaPool,
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

  const createConsistentPieData = useCallback(() => {
    if (!grantees.length) {
      return [];
    }

    const allocatedVotes = newAllocation?.allocation
      ? newAllocation.allocation.reduce((sum, a) => sum + a.amount, 0)
      : 0;
    const unallocatedVotes = votingPower - allocatedVotes;
    const data = grantees.map((grantee) => {
      const allocation = newAllocation?.allocation?.find(
        (a) => a.grantee === grantee.address,
      );

      return {
        id: grantee.address,
        name: grantee.metadata.title,
        value: allocation ? allocation.amount : 0,
        color:
          allocation && allocation.amount > 0
            ? granteeColors[grantee.address]
            : "#e0e0e0",
      };
    });

    if (newAllocation?.allocation) {
      newAllocation.allocation.forEach((allocation) => {
        if (data.some((item) => item.id === allocation.grantee)) {
          return;
        }

        data.push({
          id: allocation.grantee,
          name: allocation.grantee.substring(0, 6),
          value: allocation.amount,
          color: granteeColors[allocation.grantee] || "#1f77b4",
        });
      });
    }

    if (unallocatedVotes > 0) {
      data.push({
        id: "0xdead",
        name: "Unallocated",
        value: unallocatedVotes,
        color: "#e0e0e0",
      });
    }

    return data.filter((entry) => entry.value > 0 || entry.id === "0xdead");
  }, [grantees, newAllocation?.allocation, granteeColors, votingPower]);

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

  useEffect(() => {
    setSharedPieData(createConsistentPieData());
  }, [createConsistentPieData]);

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

  const VoteButton = () => {
    return (
      <Button
        className="btn btn-primary d-flex align-items-center gap-2 py-3 px-4 shadow-lg rounded-pill"
        onClick={() => dispatchNewAllocation({ type: "show-ballot" })}
        style={{
          width: isMobile ? 360 : 400,
          transition: "all 0.2s ease-in-out",
          transform: "scale(1)",
          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 12px 20px rgba(0, 0, 0, 0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2)";
        }}
      >
        <Stack
          direction="horizontal"
          className="justify-content-center align-items-center bg-white rounded-circle"
          style={{ width: 64, height: 64, overflow: "hidden" }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {sharedPieData ? (
                <Pie data={sharedPieData} dataKey="value" outerRadius={50}>
                  {sharedPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              ) : null}
            </PieChart>
          </ResponsiveContainer>
        </Stack>
        <Stack direction="vertical">
          <span className="fs-4 fw-semibold d-block text-center">VOTE</span>
          <small
            className={`fs-6 d-block ${totalAllocatedVotes > votingPower ? "text-warning" : "text-white-50"}`}
          >
            {totalAllocatedProjects}
            {council?.maxAllocationsPerMember
              ? `/${council.maxAllocationsPerMember}`
              : ""}{" "}
            Project{totalAllocatedProjects > 1 ? "s" : ""},{" "}
            {totalAllocatedVotes}/{votingPower} Vote
            {totalAllocatedVotes > 1 ? "s" : ""}
          </small>
        </Stack>
      </Button>
    );
  };

  return (
    <>
      <Container
        className="mx-auto mb-5 p-0"
        style={{
          maxWidth:
            isMobile || isTablet
              ? "100%"
              : isSmallScreen
                ? 1000
                : isMediumScreen
                  ? 1300
                  : 1600,
        }}
        onMouseUp={clearUnallocated}
        onTouchEnd={clearUnallocated}
      >
        <RoundBanner
          name={councilMetadata.name ?? "Flow Council"}
          description={councilMetadata.description ?? "N/A"}
          chainId={chainId}
          distributionTokenInfo={token}
          gdaPool={gdaPool}
          showDistributionPoolFunding={() =>
            setShowDistributionPoolFunding(true)
          }
        />
        <Stack
          direction="horizontal"
          gap={4}
          className="px-4 pt-5 pb-4 pt-4 fs-4"
        >
          Grantees
          <Dropdown>
            <Dropdown.Toggle
              variant="transparent"
              className="d-flex justify-content-between align-items-center border border-2 border-gray"
              style={{ width: 156 }}
            >
              {sortingMethod}
            </Dropdown.Toggle>

            <Dropdown.Menu>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.RANDOM)}
              >
                {SortingMethod.RANDOM}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.ALPHABETICAL)}
              >
                {SortingMethod.ALPHABETICAL}
              </Dropdown.Item>
              <Dropdown.Item
                onClick={() => setSortingMethod(SortingMethod.POPULAR)}
              >
                {SortingMethod.POPULAR}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </Stack>
        <Stack direction="vertical" className="flex-grow-0">
          <div
            className="px-4 pb-5"
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
                name={grantee.metadata.title}
                description={grantee.metadata.description}
                logoCid={grantee.metadata.logoImg}
                bannerCid={grantee.bannerCid}
                placeholderLogo={grantee.placeholderLogo}
                placeholderBanner={grantee.placeholderBanner}
                flowRate={grantee.flowRate}
                units={grantee.units}
                token={token}
                votingPower={votingPower}
                showGranteeDetails={() => setShowGranteeDetails(grantee)}
                granteeColor={granteeColors[grantee.address]}
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
      </Container>
      {showGranteeDetails ? (
        <GranteeDetails
          key={showGranteeDetails.id}
          id={showGranteeDetails.id}
          chainId={chainId}
          metadata={showGranteeDetails.metadata}
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
      ) : newAllocation?.showBallot ? (
        <Ballot councilAddress={councilId as Address} />
      ) : null}
      <Modal
        show={showConnectionModal}
        centered
        onHide={() => setShowConnectionModal(false)}
      >
        <Modal.Header closeButton className="align-items-start border-0 pt-3">
          <Modal.Title className="fs-5 fw-bold">
            You're a recipient in this Flow Council but haven't connected.
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          Do you want to do that now, so your{" "}
          <Link href="https://app.superfluid.finance/" target="_blank">
            Super Token balance
          </Link>{" "}
          is reflected in real time?
        </Modal.Body>
        <Modal.Footer className="border-0">
          <PoolConnectionButton
            network={network}
            poolAddress={gdaPool?.id ?? "0x"}
            isConnected={!shouldConnect}
          />
        </Modal.Footer>
      </Modal>
      {newAllocation?.allocation && newAllocation.allocation.length > 0 && (
        <Stack
          direction="horizontal"
          className="position-fixed"
          style={{
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "center" : "right",
            bottom: "2rem",
            right: isMobile ? "auto" : "2rem",
            zIndex: 3,
          }}
        >
          {isMobile || isTablet ? (
            <VoteButton />
          ) : (
            <InfoTooltip
              position={{ top: true }}
              content={<>Click to edit & submit your votes</>}
              target={<VoteButton />}
            />
          )}
        </Stack>
      )}
    </>
  );
}
