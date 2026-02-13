"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ChatView from "@/app/flow-councils/components/ChatView";
import ProjectChannelsSidebar from "@/app/flow-councils/components/ProjectChannelsSidebar";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { ChannelType } from "@/generated/kysely";

type CommunicationsProps = {
  chainId: number;
  councilId: string;
  hostname: string;
  csfrToken: string;
};

type ProjectChannel = {
  projectId: number;
  projectName: string;
  applicationId: number;
  roundId: number;
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
    }
  }
`;

export default function Communications(props: CommunicationsProps) {
  const { chainId, councilId, csfrToken } = props;

  const [channels, setChannels] = useState<ProjectChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canAccessAnnouncements, setCanAccessAnnouncements] = useState(false);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [roundName, setRoundName] = useState<string>("Round");

  const searchParams = useSearchParams();
  const router = useRouter();
  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { isMobile, isTablet } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryResLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        councilId: councilId?.toLowerCase(),
      },
      skip: !chainId || !councilId,
      pollInterval: 10000,
    });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil;

  // Channel selection: "announcements" or a project ID
  const selectedChannel = searchParams.get("channel");
  const isAnnouncementsSelected = selectedChannel === "announcements";
  const selectedProjectId =
    selectedChannel && selectedChannel !== "announcements"
      ? Number(selectedChannel)
      : null;

  const selectedProjectChannel = useMemo(() => {
    return channels.find((c) => c.projectId === selectedProjectId);
  }, [channels, selectedProjectId]);

  // User has access if they have any channels or are admin
  const hasAccess = isAdmin || channels.length > 0;

  const fetchRoundInfo = useCallback(async () => {
    if (!chainId || !councilId) return;

    try {
      const res = await fetch(
        `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
      );
      const data = await res.json();
      if (data.success && data.round) {
        setRoundId(data.round.id);
        const details =
          typeof data.round.details === "string"
            ? JSON.parse(data.round.details)
            : data.round.details;
        setRoundName(details?.name ?? "Round");
      }
    } catch (err) {
      console.error(err);
    }
  }, [chainId, councilId]);

  const fetchChannels = useCallback(async () => {
    if (!chainId || !councilId || !session?.address) return;

    try {
      setIsLoadingChannels(true);
      const res = await fetch(
        `/api/flow-council/project-channels?chainId=${chainId}&councilId=${councilId}`,
      );
      const data = await res.json();
      if (data.success) {
        setChannels(data.channels || []);
        setIsAdmin(data.isAdmin || false);
        setCanAccessAnnouncements(data.canAccessAnnouncements || false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingChannels(false);
    }
  }, [chainId, councilId, session?.address]);

  useEffect(() => {
    fetchRoundInfo();
  }, [fetchRoundInfo]);

  useEffect(() => {
    if (session?.address) {
      fetchChannels();
    }
  }, [fetchChannels, session?.address]);

  // Default to announcements channel if no channel selected (and user has access)
  // Otherwise default to first project channel
  useEffect(() => {
    if (
      !selectedChannel &&
      session?.address &&
      !isLoadingChannels &&
      hasAccess
    ) {
      if (canAccessAnnouncements) {
        router.replace(
          `/flow-councils/communications/${chainId}/${councilId}?channel=announcements`,
        );
      } else if (channels.length > 0) {
        router.replace(
          `/flow-councils/communications/${chainId}/${councilId}?channel=${channels[0].projectId}`,
        );
      }
    }
  }, [
    selectedChannel,
    session?.address,
    isLoadingChannels,
    hasAccess,
    canAccessAnnouncements,
    channels,
    chainId,
    councilId,
    router,
  ]);

  const handleSelectChannel = (channel: string) => {
    router.push(
      `/flow-councils/communications/${chainId}/${councilId}?channel=${channel}`,
    );
  };

  if (!councilId || !chainId || (!flowCouncilQueryResLoading && !flowCouncil)) {
    return (
      <span className="m-auto fs-4 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  return (
    <Stack
      direction="vertical"
      className={!isMobile ? "w-75 px-5 mx-auto mt-4" : "w-100 px-4 mt-4"}
    >
      {!session || session.address !== address ? (
        <Button
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => {
            if (!address && openConnectModal) {
              openConnectModal();
            } else if (connectedChain?.id !== chainId) {
              switchChain({ chainId });
            } else {
              handleSignIn(csfrToken);
            }
          }}
        >
          {!address
            ? "Connect Wallet"
            : connectedChain?.id !== chainId
              ? "Switch Network"
              : "Sign In With Ethereum"}
        </Button>
      ) : isLoadingChannels ? (
        <Spinner className="mt-5 mx-auto" />
      ) : !hasAccess ? (
        <Stack direction="vertical" gap={2} className="align-items-center mt-5">
          <Image src="/delete.svg" alt="" width={90} height={90} />
          <span className="text-center fs-5 fw-bold">
            You don't have access to this page.
          </span>
        </Stack>
      ) : (
        <>
          {/* Mobile/Tablet: Sidebar renders fixed button + drawer */}
          {(isMobile || isTablet) && (
            <ProjectChannelsSidebar
              channels={channels}
              isLoading={isLoadingChannels}
              selectedChannel={selectedChannel}
              roundName={roundName}
              onSelectChannel={handleSelectChannel}
              showAnnouncements={canAccessAnnouncements}
            />
          )}

          {/* Desktop: Sidebar inline with chat */}
          <Stack direction="horizontal" gap={4} className="align-items-start">
            {!isMobile && !isTablet && (
              <ProjectChannelsSidebar
                channels={channels}
                isLoading={isLoadingChannels}
                selectedChannel={selectedChannel}
                roundName={roundName}
                onSelectChannel={handleSelectChannel}
                showAnnouncements={canAccessAnnouncements}
              />
            )}

            {/* Chat Area */}
            <div className="flex-grow-1 overflow-hidden">
              {isAnnouncementsSelected ? (
                <ChatView
                  channelType={ChannelType.GROUP_ANNOUNCEMENTS}
                  chainId={chainId}
                  councilId={councilId}
                  roundId={roundId ?? undefined}
                  canWrite={isAdmin}
                  canModerate={isAdmin}
                  currentUserAddress={session?.address}
                  showEmailCheckbox={isAdmin}
                  emptyMessage="No announcements yet."
                />
              ) : selectedProjectChannel ? (
                <ChatView
                  channelType={ChannelType.GROUP_PROJECT}
                  chainId={chainId}
                  councilId={councilId}
                  roundId={roundId ?? undefined}
                  projectId={selectedProjectChannel.projectId}
                  applicationId={selectedProjectChannel.applicationId}
                  canWrite={true}
                  canModerate={isAdmin}
                  currentUserAddress={session?.address}
                  showEmailCheckbox={true}
                  emptyMessage="No messages yet in this project chat."
                />
              ) : (
                <div className="d-flex flex-column align-items-center justify-content-center p-5 bg-lace-100 rounded-4">
                  <Image
                    src="/chat.svg"
                    alt=""
                    width={64}
                    height={64}
                    className="mb-3 opacity-50"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <p className="text-muted text-center mb-0">
                    Select a channel to view messages
                  </p>
                </div>
              )}
            </div>
          </Stack>
        </>
      )}
    </Stack>
  );
}
