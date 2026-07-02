import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import useFlowCouncil from "../hooks/flowCouncil";
import { useGoodDollarVerification } from "../hooks/useGoodDollarVerification";

type EligibilityStatus =
  | "idle"
  | "checking"
  | "confirmed"
  | "viewBallot"
  | "failed"
  | "verifying";

const GD_VERIFY_RETURN_PARAM = "gdVerified";
const WHITELIST_POLL_INTERVAL_MS = 4_000;
// Whitelisting lands on Celo shortly after face verification completes, so
// polling keeps going for a grace window after the popup closes or the
// redirect returns before giving up.
const WHITELIST_GRACE_MS = 60_000;
const MAX_WATCH_MS = 10 * 60_000;

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
  const { generateFVLink, checkIsWhitelisted } = useGoodDollarVerification();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<EligibilityStatus>("idle");
  const [pendingCheck, setPendingCheck] = useState(false);
  const [pendingVerifyReturn, setPendingVerifyReturn] = useState(false);
  // Self-claim is opt-in per council: only surface the button when an admin has
  // created a "gooddollar" voter group for this council.
  const [hasGoodDollarGroup, setHasGoodDollarGroup] = useState(false);
  const watchIdRef = useRef(0);

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

  const watchVerification = useCallback(
    async (popup: Window | null) => {
      const watchId = ++watchIdRef.current;

      setStatus("verifying");

      const startedAt = Date.now();
      let popupClosedAt = popup ? null : Date.now();

      while (watchIdRef.current === watchId) {
        const isWhitelisted = await checkIsWhitelisted().catch(() => false);

        if (watchIdRef.current !== watchId) {
          return;
        }

        if (isWhitelisted) {
          popup?.close();
          checkEligibility();
          return;
        }

        if (popup && popupClosedAt === null && popup.closed) {
          popupClosedAt = Date.now();
        }

        const now = Date.now();

        if (
          now - startedAt > MAX_WATCH_MS ||
          (popupClosedAt !== null && now - popupClosedAt > WHITELIST_GRACE_MS)
        ) {
          popup?.close();
          setStatus("failed");
          return;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, WHITELIST_POLL_INTERVAL_MS),
        );
      }
    },
    [checkIsWhitelisted, checkEligibility],
  );

  useEffect(() => {
    const watchIdOnMount = watchIdRef;

    return () => {
      watchIdOnMount.current++;
    };
  }, []);

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
    if (searchParams.get(GD_VERIFY_RETURN_PARAM) !== null) {
      setPendingVerifyReturn(true);

      const params = new URLSearchParams(searchParams.toString());
      params.delete(GD_VERIFY_RETURN_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [searchParams, pathname, router]);

  useEffect(() => {
    if (
      pendingVerifyReturn &&
      isConnected &&
      address &&
      hasGoodDollarGroup &&
      !councilMember
    ) {
      setPendingVerifyReturn(false);
      watchVerification(null);
    }
  }, [
    pendingVerifyReturn,
    isConnected,
    address,
    hasGoodDollarGroup,
    councilMember,
    watchVerification,
  ]);

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

  const handleJoinToVote = async () => {
    if (!isConnected || !address) {
      setPendingCheck(true);
      openConnectModal?.();
      return;
    }

    // The popup must open synchronously on click to avoid popup blockers; it
    // is navigated to the verification link once the wallet signature
    // resolves. When it is blocked (or on mobile) the flow falls back to a
    // full-page redirect that returns with the marker param.
    const popup = isMobile
      ? null
      : window.open(
          "",
          "goodDollarFaceVerification",
          "width=600,height=700,scrollbars=yes,resizable=yes",
        );

    setStatus("verifying");

    try {
      if (popup) {
        popup.document.body.textContent = "Waiting for wallet signature...";

        const fvLink = await generateFVLink(true, window.location.href);

        if (popup.closed) {
          setStatus("failed");
          return;
        }

        popup.location.href = fvLink;
        watchVerification(popup);
      } else {
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set(GD_VERIFY_RETURN_PARAM, "1");

        window.location.href = await generateFVLink(
          false,
          returnUrl.toString(),
        );
      }
    } catch {
      popup?.close();
      setStatus("failed");
    }
  };

  if (status === "failed") {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        onClick={handleJoinToVote}
      >
        Join to Vote
      </Button>
    );
  }

  if (status === "verifying") {
    return (
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        style={{ width: isMobile ? "100%" : 240 }}
        disabled
      >
        <Spinner size="sm" className="me-2" />
        Verifying...
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
