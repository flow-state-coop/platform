"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";
import Dropdown from "react-bootstrap/Dropdown";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import RecipientCard from "../../components/RecipientCard";
import RoundBanner from "../../components/RoundBanner";
import RecipientDetails from "../../components/RecipientDetails";
import Ballot from "../../components/Ballot";
import DistributionPoolFunding from "../../components/DistributionPoolFunding";
import VoteBubble from "../../components/VoteBubble";
import { ProjectMetadata } from "@/types/project";
import { Recipient, SortingMethod } from "../../types/recipient";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowCouncil from "../../hooks/flowCouncil";
import useAnimateVoteBubble from "../../hooks/animateVoteBubble";
import { networks } from "@/lib/networks";
import { shuffle, getPlaceholderImageSrc, generateColor } from "@/lib/utils";

export default function FlowCouncil({
  chainId,
  flowCouncilId,
}: {
  chainId: number;
  flowCouncilId: string;
}) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sortingMethod, setSortingMethod] = useState(SortingMethod.RANDOM);
  const [showRecipientDetails, setShowRecipientDetails] =
    useState<Recipient | null>(null);
  const [showDistributionPoolFunding, setShowDistributionPoolFunding] =
    useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const skipRecipients = useRef(0);
  const hasNextRecipient = useRef(true);

  const network =
    networks.find((network) => network.id === Number(chainId)) ?? networks[0];
  useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const {
    currentBallot,
    newBallot,
    flowCouncil,
    flowCouncilMetadata,
    flowStateProfiles,
    distributionPool,
    token,
    showBallot,
    dispatchNewBallot,
  } = useFlowCouncil();
  const { voteBubbleRef, animateVoteBubble } = useAnimateVoteBubble();

  const poolMember = distributionPool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;
  const votingPower =
    !!address && currentBallot?.votingPower ? currentBallot.votingPower : 0;
  const currentBallotStringified = JSON.stringify(currentBallot);

  const getRecipient = useCallback(
    (recipientInfo: {
      id: string;
      address: string;
      metadata: ProjectMetadata;
    }) => {
      const adjustedFlowRate =
        BigInt(distributionPool?.flowRate ?? 0) -
        BigInt(distributionPool?.adjustmentFlowRate ?? 0);
      const member = distributionPool?.poolMembers.find(
        (member: { account: { id: string } }) =>
          member.account.id === recipientInfo.address,
      );
      const memberUnits = member?.units ? Number(member.units) : 0;
      const memberFlowRate =
        BigInt(distributionPool?.totalUnits ?? 0) > 0
          ? (BigInt(memberUnits) * adjustedFlowRate) /
            BigInt(distributionPool?.totalUnits ?? 0)
          : BigInt(0);

      return {
        id: recipientInfo.id,
        address: recipientInfo.address as `0x${string}`,
        metadata: recipientInfo.metadata,
        bannerCid: recipientInfo.metadata.bannerImg,
        twitter: recipientInfo.metadata.projectTwitter,
        flowRate: memberFlowRate ?? BigInt(0),
        units: memberUnits,
        placeholderLogo: getPlaceholderImageSrc(),
        placeholderBanner: getPlaceholderImageSrc(),
      };
    },
    [distributionPool],
  );

  const sortRecipients = useCallback(
    (recipients: Recipient[]) => {
      if (sortingMethod === SortingMethod.RANDOM) {
        return shuffle(recipients);
      }

      if (sortingMethod === SortingMethod.ALPHABETICAL) {
        return recipients.sort((a, b) => {
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
        return recipients.sort((a, b) => b.units - a.units);
      }

      return recipients;
    },
    [sortingMethod],
  );

  const recipientColors = useMemo(() => {
    if (recipients.length > 0) {
      const colorMap: Record<string, string> = {};

      recipients.forEach((recipient) => {
        colorMap[recipient.address] = generateColor(
          recipient.address + recipient.id,
        );
      });

      return colorMap;
    }

    return {};
  }, [recipients]);

  useEffect(() => {
    dispatchNewBallot({ type: "clear" });
  }, [address, dispatchNewBallot]);

  useEffect(() => {
    const currentBallot = JSON.parse(currentBallotStringified);

    if (currentBallot?.ballot) {
      dispatchNewBallot({
        type: "add",
        currentBallot,
      });
    }
  }, [currentBallotStringified, dispatchNewBallot]);

  useEffect(() => {
    if (!flowCouncil || !flowStateProfiles || !distributionPool) {
      return;
    }

    const hasRecipientBeenAddedOrRemoved =
      !hasNextRecipient.current &&
      skipRecipients.current !== flowCouncil.recipients.length;

    if (hasRecipientBeenAddedOrRemoved) {
      hasNextRecipient.current = true;
      skipRecipients.current = 0;
    }

    if (hasNextRecipient.current) {
      const recipients: Recipient[] = [];

      for (
        let i = skipRecipients.current;
        i < flowCouncil.recipients.length;
        i++
      ) {
        skipRecipients.current = i + 1;

        if (skipRecipients.current === flowCouncil.recipients.length) {
          hasNextRecipient.current = false;
        }

        const flowCouncilRecipient = flowCouncil.recipients[i];
        const profile = flowStateProfiles.find(
          (profile: { id: string }) =>
            profile.id === flowCouncilRecipient?.metadata,
        );

        if (profile && flowCouncilRecipient) {
          recipients.push(
            getRecipient({
              id: profile.id,
              address: flowCouncilRecipient.account as `0x${string}`,
              metadata: profile.metadata,
            }),
          );
        } else {
          break;
        }
      }

      setRecipients(sortRecipients(recipients));
    } else {
      setRecipients((prev) => {
        const recipients: Recipient[] = [];

        for (const i in prev) {
          recipients[i] = getRecipient({
            id: prev[i].id,
            address: prev[i].address as `0x${string}`,
            metadata: prev[i].metadata,
          });
        }

        return recipients;
      });
    }
  }, [
    flowCouncil,
    flowStateProfiles,
    distributionPool,
    getRecipient,
    sortingMethod,
    sortRecipients,
  ]);

  useEffect(() => {
    if (address && connectedChain?.id !== chainId) {
      switchChain({ chainId });
    }
  }, [address, connectedChain, chainId, switchChain]);

  useEffect(() => {
    setRecipients((prev) => sortRecipients(prev));
  }, [sortingMethod, sortRecipients]);

  const clearZeroVotes = () => {
    const zeroVotes = newBallot?.ballot.filter((ballot) => ballot.amount === 0);

    if (zeroVotes) {
      for (const vote of zeroVotes) {
        dispatchNewBallot({
          type: "delete",
          ballot: vote,
        });
      }
    }
  };

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

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
        onMouseUp={clearZeroVotes}
        onTouchEnd={clearZeroVotes}
      >
        <RoundBanner
          name={flowCouncilMetadata.name ?? "Flow Council"}
          description={flowCouncilMetadata.description ?? "N/A"}
          chainId={chainId}
          distributionTokenInfo={token}
          distributionPool={distributionPool}
          showDistributionPoolFunding={() =>
            setShowDistributionPoolFunding(true)
          }
        />
        <Stack
          direction="horizontal"
          gap={4}
          className="px-4 pt-5 pb-4 pt-4 fs-4"
        >
          Recipients
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
            {recipients.map((recipient: Recipient) => (
              <RecipientCard
                key={`${recipient.address}-${recipient.id}`}
                recipientAddress={recipient.address}
                name={recipient.metadata.title}
                description={recipient.metadata.description}
                logoCid={recipient.metadata.logoImg}
                bannerCid={recipient.bannerCid}
                placeholderLogo={recipient.placeholderLogo}
                placeholderBanner={recipient.placeholderBanner}
                flowRate={recipient.flowRate}
                units={recipient.units}
                token={token}
                votingPower={votingPower}
                showRecipientDetails={() => setShowRecipientDetails(recipient)}
                recipientColor={recipientColors[recipient.address]}
                onAddToBallot={animateVoteBubble}
              />
            ))}
          </div>
          {hasNextRecipient.current === true && (
            <Stack
              direction="horizontal"
              className="justify-content-center m-auto"
            >
              <Spinner />
            </Stack>
          )}
        </Stack>
      </Container>
      {showRecipientDetails ? (
        <RecipientDetails
          key={showRecipientDetails.id}
          id={showRecipientDetails.id}
          chainId={chainId}
          token={token}
          metadata={showRecipientDetails.metadata}
          placeholderLogo={showRecipientDetails.placeholderLogo}
          recipientAddress={showRecipientDetails.address}
          canAddToBallot={!!votingPower}
          hide={() => setShowRecipientDetails(null)}
        />
      ) : showDistributionPoolFunding ? (
        <DistributionPoolFunding
          network={network}
          hide={() => setShowDistributionPoolFunding(false)}
        />
      ) : showBallot ? (
        <Ballot flowCouncilAddress={flowCouncilId as Address} />
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
            poolAddress={distributionPool?.id ?? "0x"}
            isConnected={!shouldConnect}
          />
        </Modal.Footer>
      </Modal>
      {newBallot?.ballot && newBallot.ballot.length > 0 && (
        <VoteBubble
          recipients={recipients}
          recipientColors={recipientColors}
          votingPower={votingPower}
          voteBubbleRef={voteBubbleRef}
        />
      )}
    </>
  );
}
