"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import Stack from "react-bootstrap/Stack";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import GranteeCard from "../../components/GranteeCard";
import RoundBanner from "../../components/RoundBanner";
import GranteeDetails from "../../components/GranteeDetails";
import Ballot from "../../components/Ballot";
import DistributionPoolFunding from "../../components/DistributionPoolFunding";
import VoteBubble from "../../components/VoteBubble";
import { ProjectMetadata } from "@/types/project";
import { Grantee, SortingMethod } from "../../types/grantee";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useCouncil from "../../hooks/council";
import useAnimateVoteBubble from "../../hooks/animateVoteBubble";
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
    flowStateProfiles,
    gdaPool,
    token,
    showBallot,
    dispatchNewAllocation,
  } = useCouncil();
  const { voteBubbleRef, animateVoteBubble } = useAnimateVoteBubble();

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
          gdaPool={gdaPool}
          showDistributionPoolFunding={() =>
            setShowDistributionPoolFunding(true)
          }
        />
        <Stack direction="horizontal" gap={4} className="pt-8 pb-6 fs-6">
          Grantees
          <Dropdown>
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
        </Stack>
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
      </Stack>
      {showGranteeDetails ? (
        <GranteeDetails
          key={showGranteeDetails.id}
          id={showGranteeDetails.id}
          chainId={chainId}
          token={token}
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
      ) : showBallot ? (
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
