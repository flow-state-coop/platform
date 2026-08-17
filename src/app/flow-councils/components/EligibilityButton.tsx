import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAccount, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import useFlowCouncil from "../hooks/flowCouncil";
import { useGoodDollarVerification } from "../hooks/useGoodDollarVerification";
import { buildClaimMessage } from "../lib/claimMessage";

type EligibilityStatus =
  | "idle"
  | "checking"
  | "confirmed"
  | "viewBallot"
  | "failed"
  | "alreadyClaimed"
  | "verifying";

const GD_VERIFY_RETURN_PARAM = "gdVerified";
const WHITELIST_POLL_INTERVAL_MS = 4_000;
// Whitelisting lands on Celo shortly after face verification completes, so
// polling keeps going for a grace window after the popup closes or the
// redirect returns before giving up.
const WHITELIST_GRACE_MS = 60_000;
const MAX_WATCH_MS = 10 * 60_000;
// How long a check that started by connecting waits for the sign-in connecting
// prompted for. A session for this wallet is proof enough to claim, so checking
// before it resolves asks for a second signature the sign-in was about to make
// unnecessary. Bounded because dismissing that prompt is allowed, and then the
// claim signature is the only proof left.
const SIGN_IN_SETTLE_MS = 6_000;
const GENERIC_CLAIM_ERROR = "There was an error, please try again";

// The refusals a fresh attempt can answer. An expired timestamp came from this
// machine's clock, so re-signing is what fixes it; anything else re-sent
// verbatim would only fail the same way.
const isRetryableReason = (reason?: string) => reason === "expired_signature";

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
  const { data: session, status: sessionStatus } = useSession();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const { councilMember, dispatchShowBallot } = useFlowCouncil();
  const { generateFVLink, checkIsWhitelisted } = useGoodDollarVerification();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<EligibilityStatus>("idle");
  const [claimError, setClaimError] = useState("");
  // A queued check remembers what it is waiting on: "connect" waits out the
  // sign-in prompt a fresh connect opens, "session" only waits for the already
  // running session fetch to answer. Only the first has a prompt in flight
  // that is worth a grace window.
  const [pendingCheck, setPendingCheck] = useState<
    false | "connect" | "session"
  >(false);
  const [pendingVerifyReturn, setPendingVerifyReturn] = useState(false);
  // Self-claim is opt-in per council: only surface the button when an admin has
  // created a "gooddollar" voter group for this council.
  const [hasGoodDollarGroup, setHasGoodDollarGroup] = useState(false);
  const watchIdRef = useRef(0);
  const checkIdRef = useRef(0);

  const checkEligibility = useCallback(async () => {
    if (!address) {
      return;
    }

    // Every verdict below describes the wallet the check started with, and the
    // request outlives a wallet change, so it is cancelled the same way the
    // verification watch is. Without this, wallet A's answer lands on B.
    const checkId = ++checkIdRef.current;
    const isCurrent = () => checkIdRef.current === checkId;

    setStatus("checking");
    setClaimError("");

    // Two attempts at most, and a second one only for a refusal that
    // isRetryableReason says a fresh signature can answer.
    for (let attempt = 0; attempt < 2; attempt++) {
      // The spot is bound to whichever wallet claims it, permanently, so the
      // route has to know this wallet consented. Signing in already proved
      // that, and connecting prompts for it, so only a wallet that skipped
      // sign-in is asked to sign here. A declined prompt grants nothing and is
      // not a failure state.
      const issuedAt = Date.now();
      let signature: string | undefined;

      if (session?.address?.toLowerCase() !== address.toLowerCase()) {
        try {
          signature = await signMessageAsync({
            message: buildClaimMessage({
              chainId,
              councilId,
              address,
              issuedAt,
            }),
          });
        } catch {
          if (isCurrent()) {
            setStatus("idle");
          }

          return;
        }
      }

      let data: {
        success?: boolean;
        alreadyClaimed?: boolean;
        notWhitelisted?: boolean;
        reason?: string;
        error?: string;
      };

      try {
        const res = await fetch("/api/flow-council/eligibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            chainId,
            councilId,
            signature,
            issuedAt,
          }),
        });
        data = await res.json();
      } catch {
        if (isCurrent()) {
          setStatus("idle");
          setClaimError(GENERIC_CLAIM_ERROR);
        }

        return;
      }

      if (!isCurrent()) {
        return;
      }

      if (attempt === 0 && signature && isRetryableReason(data.reason)) {
        // The retry opens a second wallet prompt, which unexplained looks like
        // a double charge for the same click.
        setClaimError("The first signature expired, please sign once more");
        continue;
      }

      if (data.success) {
        setStatus("confirmed");
      } else if (data.alreadyClaimed) {
        // The verification is real, so face verification would only pass again
        // and land back here. Only the wallet holding the slot can vote.
        setStatus("alreadyClaimed");
      } else if (data.notWhitelisted) {
        // "failed" routes into face verification, so it is reserved for a
        // definitive not-whitelisted answer. Everything else is transient (an
        // RPC hiccup on the bot's addVoter call, a signature the server
        // refused), so the button stays clickable for a plain re-check and
        // says what happened rather than resetting to nothing.
        setStatus("failed");
      } else {
        setStatus("idle");
        setClaimError(data.error ?? GENERIC_CLAIM_ERROR);
      }

      return;
    }
  }, [address, chainId, councilId, session?.address, signMessageAsync]);

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
    // The alias only satisfies react-hooks/exhaustive-deps, which flags
    // reading ref.current inside effect cleanups.
    const watchIdOnMount = watchIdRef;

    return () => {
      watchIdOnMount.current++;
    };
  }, []);

  // Every status describes the connected wallet, so a new one starts over.
  // "alreadyClaimed" in particular is only escapable this way: the identity
  // holds a slot with another wallet, and that wallet is what has to connect.
  // Cancels any verification watch still polling for the old wallet.
  useEffect(() => {
    watchIdRef.current++;
    checkIdRef.current++;
    setStatus("idle");
    setClaimError("");
  }, [address]);

  useEffect(() => {
    if (
      !pendingCheck ||
      !isConnected ||
      !address ||
      sessionStatus === "loading"
    )
      return;

    // Connecting prompts for sign-in, and a session for this wallet is proof
    // enough to claim, so a check queued behind that connect waits for the
    // prompt rather than racing it into a second signature. The wait ends the
    // moment the session lands, and gives up after a grace window because
    // dismissing sign-in is allowed. Nothing else is worth waiting on: a
    // session signed in as another wallet is not going to become this one, and
    // a check that only waited out the session fetch has no prompt in flight.
    if (pendingCheck === "connect" && sessionStatus === "unauthenticated") {
      setStatus("checking");

      const timeout = setTimeout(() => {
        setPendingCheck(false);
        checkEligibility();
      }, SIGN_IN_SETTLE_MS);

      return () => clearTimeout(timeout);
    }

    setPendingCheck(false);
    checkEligibility();
  }, [
    pendingCheck,
    isConnected,
    address,
    session?.address,
    sessionStatus,
    checkEligibility,
  ]);

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
      setPendingCheck("connect");
      openConnectModal?.();
      return;
    }

    if (councilMember) {
      dispatchShowBallot({ type: "show" });
      return;
    }

    // A click that lands while the session is still loading waits for the
    // answer, else it asks for a signature the session may be about to make
    // unnecessary.
    if (sessionStatus === "loading") {
      setStatus("checking");
      setClaimError("");
      setPendingCheck("session");
      return;
    }

    checkEligibility();
  };

  const handleJoinToVote = async () => {
    // Reconnecting may bring a different, possibly already-whitelisted
    // address, so run the cheap eligibility re-check instead of jumping
    // straight into face verification.
    if (!isConnected || !address) {
      setPendingCheck("connect");
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

  if (status === "alreadyClaimed") {
    return (
      <Stack
        direction="vertical"
        gap={2}
        style={{ width: isMobile ? "100%" : 240 }}
      >
        <Button
          variant="primary"
          className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
          disabled
        >
          Already Claimed
        </Button>
        {/* Onscreen rather than a tooltip: switching wallets is the only way
            out of this state, and touch devices never see a title. */}
        <span className="text-center">
          Your GoodDollar identity already votes here with another wallet.
        </span>
      </Stack>
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
    <Stack
      direction="vertical"
      gap={2}
      style={{ width: isMobile ? "100%" : 240 }}
    >
      <Button
        variant="primary"
        className="py-4 text-light rounded-4 fs-lg fw-semi-bold"
        onClick={handleClick}
        disabled={status === "checking"}
      >
        {status === "checking" ? (
          <Spinner size="sm" />
        ) : (
          "Check Voter Eligibility"
        )}
      </Button>
      {claimError ? (
        <span className="text-center text-danger">{claimError}</span>
      ) : null}
    </Stack>
  );
}
