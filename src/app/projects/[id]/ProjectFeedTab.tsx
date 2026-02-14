"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import ChatView from "@/app/flow-councils/components/ChatView";
import useSiwe from "@/hooks/siwe";

type ProjectFeedTabProps = {
  projectId: string;
  isManager: boolean;
  csrfToken: string;
};

export default function ProjectFeedTab({
  projectId,
  isManager,
  csrfToken,
}: ProjectFeedTabProps) {
  const [chainId, setChainId] = useState<number | null>(null);
  const [councilId, setCouncilId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    const fetchRoundInfo = async () => {
      try {
        const res = await fetch(
          `/api/flow-council/projects/${projectId}/round-info`,
        );
        const data = await res.json();

        if (data.success) {
          setChainId(data.chainId);
          setCouncilId(data.councilId);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundInfo();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!chainId || !councilId) {
    return (
      <p className="text-muted py-5 text-center">
        No feed available for this project.
      </p>
    );
  }

  const hasSession = !!session && session.address === address;

  if (isManager && !hasSession) {
    return (
      <div>
        <Button
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4 w-100"
          onClick={() => {
            if (!address && openConnectModal) {
              openConnectModal();
            } else if (connectedChain?.id !== chainId) {
              switchChain({ chainId });
            } else {
              handleSignIn(csrfToken);
            }
          }}
        >
          {!address
            ? "Connect Wallet"
            : connectedChain?.id !== chainId
              ? "Switch Network"
              : "Sign In With Ethereum"}
        </Button>
        <ChatView
          channelType="PUBLIC_PROJECT"
          chainId={chainId}
          councilId={councilId}
          projectId={Number(projectId)}
          canWrite={false}
          canModerate={false}
          currentUserAddress={address}
          newestFirst
          emptyMessage="No posts yet."
        />
      </div>
    );
  }

  return (
    <ChatView
      channelType="PUBLIC_PROJECT"
      chainId={chainId}
      councilId={councilId}
      projectId={Number(projectId)}
      canWrite={isManager && hasSession}
      canModerate={isManager && hasSession}
      currentUserAddress={address}
      newestFirst
      emptyMessage="No posts yet."
    />
  );
}
