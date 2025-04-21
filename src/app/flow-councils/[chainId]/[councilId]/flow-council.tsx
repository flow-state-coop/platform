"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Address } from "viem";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import GranteeCard from "../../components/GranteeCard";
import RoundBanner from "../../components/RoundBanner";
import Ballot from "../../components/Ballot";
import DistributionPoolFunding from "../../components/DistributionPoolFunding";
import { ProjectMetadata } from "@/types/project";
import { Grantee, SortingMethod } from "../../types/grantee";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "../../hooks/council";
import { networks } from "@/lib/networks";
import { shuffle, getPlaceholderImageSrc } from "@/lib/utils";

// Generate a deterministic color based on string input
const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate HSL color with good saturation and lightness for visibility
  const h = Math.abs(hash % 360);
  const s = 65 + (hash % 20); // 65-85% saturation
  const l = 40 + (hash % 10); // 40-50% lightness for darker/richer colors
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};

export default function Index({
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
  
  // Selection and allocation state for voting UI
  const [selectedGrantees, setSelectedGrantees] = useState<{id: string, allocation: number}[]>([]);

  const skipGrantees = useRef(0);
  const hasNextGrantee = useRef(true);

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];
  useMediaQuery();
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
    dispatchNewAllocation
  } = useCouncil();

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

  // Sync our UI state with the ballot system
  useEffect(() => {
    if (newAllocation?.allocation) {
      // Update our selection UI based on ballot allocations
      const newSelected = newAllocation.allocation.map(item => ({
        id: item.grantee,
        allocation: item.amount
      }));
      
      // Only update if the selection has actually changed
      if (JSON.stringify(newSelected) !== JSON.stringify(selectedGrantees)) {
        setSelectedGrantees(newSelected);
      }
    }
  }, [newAllocation?.allocation]);
  
  // Calculate the total voting power available
  const votingPower = currentAllocation?.votingPower || 100;
  
  // Map grantees to their colors for pie charts
  const [granteeColors, setGranteeColors] = useState<Record<string, string>>({});
  
  // Generate consistent colors for grantees
  useEffect(() => {
    if (grantees.length > 0) {
      const colorMap: Record<string, string> = {};
      grantees.forEach(grantee => {
        colorMap[grantee.address] = generateColor(grantee.address + grantee.id);
      });
      setGranteeColors(colorMap);
    }
  }, [grantees]);
  
  // Convert allocation amount to percentage
  const amountToPercentage = (amount: number): number => {
    return Math.round((amount / votingPower) * 100);
  };
  
  // Convert percentage to allocation amount
  const percentageToAmount = (percentage: number): number => {
    return Math.round((percentage / 100) * votingPower);
  };
  
  // Handle grantee selection
  const handleGranteeSelection = (granteeAddress: `0x${string}`) => {
    console.log("Selecting grantee:", granteeAddress);
    const isCurrentlySelected = newAllocation?.allocation?.some(
      a => a.grantee === granteeAddress
    );
    
    if (isCurrentlySelected) {
      // Find and remove the grantee from ballot
      dispatchNewAllocation({
        type: "delete",
        allocation: { grantee: granteeAddress, amount: 0 }
      });
    } else {
      // Calculate how many votes to allocate to the new grantee
      let newGranteeVotes = 0;
      
      // Check if the grantee is already in currentAllocation (important to prevent duplication)
      const isInCurrentAllocation = currentAllocation?.allocation?.some(
        a => a.grantee === granteeAddress
      );
      
      if (!newAllocation?.allocation || newAllocation.allocation.length === 0) {
        // If this is the first grantee, give all votes
        newGranteeVotes = votingPower;
      } else {
        // Take votes evenly from other grantees
        const totalAllocated = newAllocation.allocation.reduce(
          (sum, a) => sum + a.amount, 0
        );
        
        // If less than total voting power is allocated, use the remainder
        if (totalAllocated < votingPower) {
          newGranteeVotes = votingPower - totalAllocated;
        } else {
          // Take an equal percentage from each existing allocation
          const votesTaken = Math.floor(totalAllocated / (newAllocation.allocation.length + 1));
          newGranteeVotes = votesTaken;
          
          // Update existing allocations
          newAllocation.allocation.forEach(allocation => {
            const newAmount = Math.max(1, allocation.amount - Math.floor(allocation.amount / (newAllocation.allocation.length + 1)));
            dispatchNewAllocation({
              type: "update",
              allocation: {
                grantee: allocation.grantee,
                amount: newAmount
              }
            });
          });
        }
      }
      
      if (isInCurrentAllocation) {
        // If the grantee is already in currentAllocation, use update instead of add
        dispatchNewAllocation({
          type: "update",
          allocation: { grantee: granteeAddress, amount: newGranteeVotes }
        });
      } else {
        // Only use "add" with currentAllocation for truly new grantees
        // We're deliberately NOT passing currentAllocation here to prevent duplication
        dispatchNewAllocation({
          type: "add",
          allocation: { grantee: granteeAddress, amount: newGranteeVotes }
        });
      }
    }
  };
  
  // Handle allocation percentage change
  const handleAllocationChange = (granteeAddress: `0x${string}`, newPercentage: number) => {
    if (!newAllocation?.allocation) return;
    
    // Find the grantee being updated
    const granteeIndex = newAllocation.allocation.findIndex(a => a.grantee === granteeAddress);
    if (granteeIndex === -1) return;
    
    // Convert percentage to votes
    const newAmount = percentageToAmount(newPercentage);
    const oldAmount = newAllocation.allocation[granteeIndex].amount;
    const difference = newAmount - oldAmount;
    
    // If there's only one allocation, it gets all votes
    if (newAllocation.allocation.length === 1) {
      dispatchNewAllocation({
        type: "update",
        allocation: { grantee: granteeAddress, amount: votingPower }
      });
      return;
    }
    
    // If trying to allocate more votes than available
    const totalAllocated = newAllocation.allocation.reduce(
      (sum, a) => sum + a.amount, 0
    );
    
    if (totalAllocated + difference > votingPower) {
      // We need to reduce other allocations proportionally
      const otherAllocations = newAllocation.allocation.filter((_, i) => i !== granteeIndex);
      const totalOtherVotes = otherAllocations.reduce((sum, a) => sum + a.amount, 0);
      
      if (totalOtherVotes > 0) {
        // Calculate how much to take from each allocation proportionally
        otherAllocations.forEach(allocation => {
          const proportion = allocation.amount / totalOtherVotes;
          const voteReduction = Math.floor(difference * proportion);
          const newAllocationAmount = Math.max(1, allocation.amount - voteReduction);
          
          dispatchNewAllocation({
            type: "update",
            allocation: {
              grantee: allocation.grantee,
              amount: newAllocationAmount
            }
          });
        });
      }
    }
    
    // Update the grantee's allocation
    dispatchNewAllocation({
      type: "update",
      allocation: { grantee: granteeAddress, amount: newAmount }
    });
  };
  
  // Prepare data for pie chart in VOTE button
  const prepareVoteButtonPieData = () => {
    if (!newAllocation?.allocation || newAllocation.allocation.length === 0) {
      return [{ name: "Unallocated", value: votingPower, color: "#e0e0e0" }];
    }
    
    // Filter out allocations with 0 votes
    const validAllocations = newAllocation.allocation.filter(allocation => allocation.amount > 0);
    
    // Calculate total allocated votes
    const totalAllocated = validAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    
    // Create pie data for valid allocations
    const allocatedData = validAllocations.map(allocation => {
      const grantee = grantees.find(g => g.address === allocation.grantee);
      return {
        name: grantee ? grantee.metadata.title : allocation.grantee.substring(0, 6),
        value: allocation.amount,
        color: granteeColors[allocation.grantee] || "#1f77b4"
      };
    });
    
    // Add unallocated segment if there are any unallocated votes
    const unallocatedVotes = votingPower - totalAllocated;
    if (unallocatedVotes > 0) {
      allocatedData.push({
        name: "Unallocated",
        value: unallocatedVotes,
        color: "#e0e0e0"
      });
    }
    
    return allocatedData;
  };
  
  // Modified to open the ballot sidebar
  const handleVote = () => {
    dispatchNewAllocation({ type: "show-ballot" });
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
          name={councilMetadata.name}
          description={councilMetadata.description}
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
            {grantees.map((grantee: Grantee) => {
              // Find if this grantee is in the ballot
              const ballotAllocation = newAllocation?.allocation?.find(
                allocation => allocation.grantee === grantee.address
              );
              
              const isSelected = !!ballotAllocation;
              const allocationAmount = ballotAllocation?.amount || 0;
              const allocationPercentage = amountToPercentage(allocationAmount);
              
              return (
                <GranteeCard
                  key={`${grantee.address}-${grantee.id}`}
                  id={grantee.id}
                  granteeAddress={grantee.address}
                  name={grantee.metadata.title}
                  description={grantee.metadata.description}
                  logoCid={grantee.metadata.logoImg}
                  bannerCid={grantee.bannerCid}
                  placeholderLogo={grantee.placeholderLogo}
                  placeholderBanner={grantee.placeholderBanner}
                  flowRate={grantee.flowRate}
                  units={grantee.units}
                  network={network}
                  isSelected={isSelected}
                  allocationPercentage={allocationPercentage}
                  onAllocationChange={(value) => handleAllocationChange(grantee.address, value)}
                  onClick={() => handleGranteeSelection(grantee.address)}
                  votingPower={votingPower}
                  pieColor={granteeColors[grantee.address]}
                />
              );
            })}
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
        <div className="position-fixed" 
             style={{ 
               bottom: '2rem', 
               right: '2rem', 
               zIndex: 1050 
             }}>
          <button 
            className="btn btn-primary d-flex align-items-center py-3 px-4 shadow-lg rounded-pill"
            onClick={handleVote}
            style={{ 
              minWidth: '200px',
              transition: 'all 0.2s ease-in-out',
              transform: 'scale(1)',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 12px 20px rgba(0, 0, 0, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
            }}
          >
            <div className="d-flex justify-content-center align-items-center me-3 bg-white rounded-circle" 
                 style={{ width: '64px', height: '64px', overflow: 'hidden' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip 
                    formatter={(value, name) => [`${value} votes`, name]}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  />
                  <Pie
                    data={prepareVoteButtonPieData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={28}
                    fill="#8884d8"
                    paddingAngle={1}
                    dataKey="value"
                  >
                    {prepareVoteButtonPieData().map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        strokeWidth={entry.name === "Unallocated" ? 1 : 0}
                        stroke={entry.name === "Unallocated" ? "#cccccc" : "none"}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <span className="fs-4 fw-semibold d-block">VOTE</span>
              <small className="fs-6 d-block text-white-50">{newAllocation.allocation.filter(a => a.amount > 0).length} projects</small>
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
    </>
  );
}
