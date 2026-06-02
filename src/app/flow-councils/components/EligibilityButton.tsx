import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import useFlowCouncil from "../hooks/flowCouncil";

type EligibilityStatus =
  | "idle"
  | "checking"
  | "confirmed"
  | "viewBallot"
  | "failed";

export default function EligibilityButton({
  chainId,
  councilId,
  isMobile,
}: {
  chainId: number;
  councilId: string;
  isMobile: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { councilMember, dispatchShowBallot } = useFlowCouncil();
  const [status, setStatus] = useState<EligibilityStatus>("idle");
  const [pendingCheck, setPendingCheck] = useState(false);
  // Self-claim is opt-in per council: only surface the button when an admin has
  // created a "gooddollar" voter group for this council.
  const [hasGoodDollarGroup, setHasGoodDollarGroup] = useState(false);

  const checkEligibility = useCallback(async () => {
    setStatus("checking");

    try {
      const res = await fetch("/api/flow-council/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chainId, councilId }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("confirmed");
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("idle");
    }
  }, [address, chainId, councilId]);

  useEffect(() => {
    if (pendingCheck && isConnected && address) {
      setPendingCheck(false);
      checkEligibility();
    }
  }, [pendingCheck, isConnected, address, checkEligibility]);

  useEffect(() => {
    if (councilMember && status === "idle") {
      setStatus("viewBallot");
    }
  }, [councilMember, status]);

  useEffect(() => {
    if (status === "confirmed" && councilMember) {
      const timeout = setTimeout(() => setStatus("viewBallot"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [status, councilMember]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/voter-groups/public?chainId=${chainId}&councilId=${councilId}`,
        );
        const data = await res.json();

        if (!cancelled) {
          setHasGoodDollarGroup(
            Array.isArray(data.groups) &&
              data.groups.some(
                (group: { eligibilityMethod: string }) =>
                  group.eligibilityMethod === "gooddollar",
              ),
          );
        }
      } catch {
        // Leave the button hidden on a failed lookup.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId, councilId]);

  if (!hasGoodDollarGroup) {
    return null;
  }

  const handleClick = () => {
    if (!isConnected) {
      setPendingCheck(true);
      openConnectModal?.();
      return;
    }

    if (councilMember) {
      dispatchShowBallot({ type: "show" });
      return;
    }

    checkEligibility();
  };

  if (status === "failed") {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        href="https://goodwallet.xyz/"
        target="_blank"
      >
        Join to Vote
      </Button>
    );
  }

  if (status === "confirmed") {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        disabled
      >
        <span className="text-success">&#10003;</span> Confirmed!
      </Button>
    );
  }

  if (status === "viewBallot") {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        onClick={() => dispatchShowBallot({ type: "show" })}
      >
        View Ballot
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
      style={{ width: isMobile ? "100%" : 240 }}
      onClick={handleClick}
      disabled={status === "checking"}
    >
      {status === "checking" ? (
        <Spinner size="sm" />
      ) : (
        "Check Voter Eligibility"
      )}
    </Button>
  );
}
