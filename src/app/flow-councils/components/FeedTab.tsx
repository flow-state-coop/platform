"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import RoundFeedView from "@/app/flow-councils/components/RoundFeedView";
import useSiwe from "@/hooks/siwe";

type FeedTabProps = {
  chainId: number;
  councilId: string;
  csfrToken: string;
};

export default function FeedTab({
  chainId,
  councilId,
  csfrToken,
}: FeedTabProps) {
  const [roundId, setRoundId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (!address) {
      setIsAdmin(false);
      setRoundId(null);
      setIsLoading(false);
      return;
    }

    const checkAdmin = async () => {
      setIsLoading(true);

      try {
        const params = new URLSearchParams({
          chainId: chainId.toString(),
          councilId,
          address,
        });
        const res = await fetch(`/api/flow-council/admin-check?${params}`);
        const data = await res.json();

        if (data.success) {
          setRoundId(data.roundId);
          setIsAdmin(data.isAdmin);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdmin();
  }, [address, chainId, councilId]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  const hasSession = !!session && session.address === address;

  if (isAdmin && !hasSession) {
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
        <RoundFeedView
          chainId={chainId}
          councilId={councilId}
          roundId={roundId ?? undefined}
          isAdmin={false}
          currentUserAddress={address}
        />
      </div>
    );
  }

  return (
    <RoundFeedView
      chainId={chainId}
      councilId={councilId}
      roundId={roundId ?? undefined}
      isAdmin={isAdmin && hasSession}
      currentUserAddress={address}
    />
  );
}
