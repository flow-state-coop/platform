"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Address } from "viem";
import { useAccount } from "wagmi";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import GranteeCard from "../../components/GranteeCard";
import RoundBanner from "../../components/RoundBanner";
import Ballot from "../../components/Ballot";
import DistributionPoolFunding from "../../components/DistributionPoolFunding";
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
  const { address } = useAccount();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const {
    newAllocation,
    council,
    councilMetadata,
    flowStateProfiles,
    gdaPool,
    token,
    currentAllocation,
    dispatchNewAllocation,
  } = useCouncil();

  const poolMember = gdaPool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;
  const votingPower = currentAllocation?.votingPower ?? 0;

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
    setGrantees((prev) => sortGrantees(prev));
  }, [sortingMethod, sortGrantees]);

  // Create a consistent pie chart data structure that all charts will use
  // This ensures wedges appear in exactly the same positions in all charts
  const createConsistentPieData = useCallback(() => {
    if (!grantees.length) {
      return [];
    }

    // First, calculate total allocated votes
    const allocatedVotes = newAllocation?.allocation
      ? newAllocation.allocation.reduce((sum, a) => sum + a.amount, 0)
      : 0;

    // Calculate unallocated votes
    const unallocatedVotes = votingPower - allocatedVotes;

    // Start with all grantees, even those without allocations
    const data = grantees.map((grantee) => {
      const allocation = newAllocation?.allocation?.find(
        (a) => a.grantee === grantee.address,
      );

      return {
        id: grantee.address,
        name: grantee.metadata.title,
        // If this grantee has an allocation, use it; otherwise 0
        value: allocation ? allocation.amount : 0,
        // If this grantee has an allocation, use their color; otherwise gray
        color:
          allocation && allocation.amount > 0
            ? granteeColors[grantee.address]
            : "#e0e0e0",
      };
    });

    // Also include any allocations for grantees that aren't in the visible list
    // (this can happen when filtering or pagination)
    if (newAllocation?.allocation) {
      newAllocation.allocation.forEach((allocation) => {
        // If we already have this grantee in our data, skip it
        if (data.some((item) => item.id === allocation.grantee)) {
          return;
        }

        // Add this allocation to our data
        data.push({
          id: allocation.grantee,
          name: allocation.grantee.substring(0, 6), // Use address as name if we don't have metadata
          value: allocation.amount,
          color: granteeColors[allocation.grantee] || "#1f77b4",
        });
      });
    }

    // Always add an entry for unallocated votes if there are any
    if (unallocatedVotes > 0) {
      data.push({
        id: "0xUnallocated",
        name: "Unallocated",
        value: unallocatedVotes,
        color: "#e0e0e0", // Grey color for unallocated votes
      });
    }

    // Filter out any entries with zero value to prevent empty wedges
    // EXCEPT keep unallocated votes even if they're zero (for consistency)
    return data.filter(
      (entry) => entry.value > 0 || entry.id === "0xUnallocated",
    );
  }, [grantees, newAllocation?.allocation, granteeColors, votingPower]);

  // Shared pie data that will be used by all charts

  // Update the shared pie data whenever relevant data changes
  useEffect(() => {
    setSharedPieData(createConsistentPieData());
  }, [createConsistentPieData]);

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

  const renderCustomPieChart = () => {
    if (!sharedPieData.length) return null;

    return (
      <Pie
        data={sharedPieData}
        cx="50%"
        cy="50%"
        innerRadius={0}
        outerRadius={28}
        dataKey="value"
        nameKey="name"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeShape={(props: any) => <Sector {...props} />}
        labelLine={false}
        isAnimationActive={false}
        startAngle={-90}
        endAngle={270}
        blendStroke={true}
      >
        {sharedPieData.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={entry.color} />
        ))}
      </Pie>
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

      {/* Vote Button with Pie Chart */}
      {newAllocation?.allocation && newAllocation.allocation.length > 0 && (
        <div
          className="position-fixed"
          style={{
            bottom: "2rem",
            right: "2rem",
            zIndex: 3, // just enought to be above the pie charts, but below the drawer
          }}
        >
          <button
            className="btn btn-primary d-flex align-items-center py-3 px-4 shadow-lg rounded-pill"
            onClick={() => dispatchNewAllocation({ type: "show-ballot" })}
            style={{
              minWidth: "200px",
              transition: "all 0.2s ease-in-out",
              transform: "scale(1)",
              boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow =
                "0 12px 20px rgba(0, 0, 0, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.2)";
            }}
          >
            <div
              className="d-flex justify-content-center align-items-center me-3 bg-white rounded-circle"
              style={{ width: "64px", height: "64px", overflow: "hidden" }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(value, name) => [`${value} votes`, name]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.9)",
                      borderRadius: "4px",
                      fontSize: "12px",
                    }}
                  />
                  {renderCustomPieChart()}
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: "14.5em" }}>
              <span className="fs-4 fw-semibold d-block">VOTE</span>
              <small className="fs-6 d-block text-white-50">
                {
                  sharedPieData.filter(
                    (entry) => entry.value > 0 && entry.id !== "0xUnallocated",
                  ).length
                }{" "}
                projects
                {(() => {
                  // Calculate unallocated votes
                  const unallocated =
                    sharedPieData.find((entry) => entry.id === "0xUnallocated")
                      ?.value || 0;
                  if (unallocated > 0) {
                    return ` (${unallocated} votes unallocated)`;
                  } else {
                    return " (all votes allocated)";
                  }
                })()}
              </small>
            </div>
          </button>
        </div>
      )}

      {showDistributionPoolFunding ? (
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
    </>
  );
}
