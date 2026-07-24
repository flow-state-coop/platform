import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Stack from "react-bootstrap/Stack";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import useFlowCouncil from "../hooks/flowCouncil";
import { buildClaimMessage } from "../lib/claimMessage";
import EligibilityRequirementRow, {
  type RequirementRowStatus,
} from "./EligibilityRequirementRow";

export type NftRequirementGroup = {
  groupId: number;
  name: string;
  defaultVotingPower: number;
  nftAcquisitionUrl?: string | null;
};

type StatusRow = {
  groupId: number;
  name: string;
  votes: number;
  status: "met" | "unmet" | "unknown";
};

type ModalState =
  | "list-loading"
  | "list-resolved"
  | "no-wallet"
  | "already-has-votes"
  | "claiming-signing"
  | "claiming-pending"
  | "granted"
  | "claim-error"
  | "no-requirements"
  | "council-unavailable";

const CLAIM_ERROR_COPY: Record<string, string> = {
  rate_limited: "Try again in a moment.",
  chain_error:
    "The transaction didn't go through. Nothing was granted, you can try again.",
  bot_missing_role:
    "This council's setup is incomplete. An admin needs to grant the Flow State bot permission to add voters.",
  check_unavailable:
    "We couldn't finish checking your wallet. Try again in a moment.",
  not_eligible: "This wallet doesn't meet any of the requirements yet.",
  no_requirements: "This council has no NFT requirements configured.",
  invalid_signature: "That signature couldn't be verified. Try again.",
  expired_signature: "That signature expired. Try again.",
};

export default function NftEligibilityModal({
  show,
  onHide,
  chainId,
  councilId,
  requirements,
}: {
  show: boolean;
  onHide: () => void;
  chainId: number;
  councilId: string;
  requirements: NftRequirementGroup[];
}) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { councilMember, dispatchShowBallot } = useFlowCouncil();
  const { signMessageAsync } = useSignMessage();

  const [state, setState] = useState<ModalState>("list-loading");
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [currentVotes, setCurrentVotes] = useState(0);
  const [grantedVotes, setGrantedVotes] = useState<number | null>(null);
  const [claimErrorCode, setClaimErrorCode] = useState<string | null>(null);
  const checkedAddressRef = useRef<string | null>(null);
  const claimInFlightRef = useRef(false);

  const acquisitionUrlFor = useCallback(
    (groupId: number) =>
      requirements.find((requirement) => requirement.groupId === groupId)
        ?.nftAcquisitionUrl ?? null,
    [requirements],
  );

  const loadStatus = useCallback(async () => {
    if (requirements.length === 0) {
      setState("no-requirements");
      return;
    }

    if (!isConnected || !address) {
      setState("no-wallet");
      return;
    }

    const requestedAddress = address;
    const unknownRows = () =>
      requirements.map((requirement) => ({
        groupId: requirement.groupId,
        name: requirement.name,
        votes: requirement.defaultVotingPower,
        status: "unknown" as const,
      }));

    setState("list-loading");

    try {
      const res = await fetch("/api/flow-council/eligibility/nft-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, councilId, address: requestedAddress }),
      });
      const data = await res.json();

      if (checkedAddressRef.current !== requestedAddress) {
        return;
      }

      if (!data.success) {
        setRows(unknownRows());
        setState("list-resolved");
        return;
      }

      const statusRows: StatusRow[] = data.requirements ?? [];

      if (statusRows.length === 0) {
        setRows([]);
        setState("no-requirements");
        return;
      }

      setRows(statusRows);

      const votingPower = Number(data.votingPower);
      const highestMetVotes = statusRows
        .filter((row) => row.status === "met")
        .reduce((largest, row) => Math.max(largest, row.votes), 0);

      setCurrentVotes(votingPower);

      // An existing voter stays on the recheck path only when a met tier
      // beats what they already hold; the claim then raises their votes.
      if (votingPower > 0 && highestMetVotes <= votingPower) {
        setGrantedVotes(votingPower);
        setState("already-has-votes");
        return;
      }

      setState(
        data.botHasRole === false ? "council-unavailable" : "list-resolved",
      );
    } catch {
      if (checkedAddressRef.current !== requestedAddress) {
        return;
      }

      setRows(unknownRows());
      setState("list-resolved");
    }
  }, [address, chainId, councilId, isConnected, requirements]);

  // Verdicts belong to the wallet they were fetched for: switching or
  // disconnecting drops them and invalidates any response still in flight.
  useEffect(() => {
    checkedAddressRef.current = isConnected ? (address ?? null) : null;
    setRows([]);
    setCurrentVotes(0);
    setGrantedVotes(null);
  }, [address, isConnected]);

  // An existing voter loads the list too: a recheck may find a tier above
  // their current allocation. councilMember is deliberately not a dependency,
  // so the poll catching up after a grant cannot clobber the granted state.
  useEffect(() => {
    if (!show || claimInFlightRef.current) {
      return;
    }

    setClaimErrorCode(null);
    loadStatus();
  }, [show, loadStatus]);

  const metRows = rows.filter((row) => row.status === "met");
  // The grant is the largest single allocation, never the sum.
  const claimableVotes = metRows.reduce(
    (largest, row) => Math.max(largest, row.votes),
    0,
  );

  const handleClaim = async () => {
    if (!address) {
      return;
    }

    setClaimErrorCode(null);
    claimInFlightRef.current = true;
    setState("claiming-signing");

    const issuedAt = Date.now();

    let signature: string;

    try {
      signature = await signMessageAsync({
        message: buildClaimMessage({ chainId, councilId, address, issuedAt }),
      });
    } catch {
      // A declined signature grants nothing and is not a failure state.
      claimInFlightRef.current = false;
      setState("list-resolved");
      return;
    }

    setState("claiming-pending");

    try {
      const res = await fetch("/api/flow-council/eligibility/nft-claim", {
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
      const data = await res.json();

      if (data.success) {
        // The ALREADY_ADDED path deliberately omits votingPower, since another
        // claim set it and this route never read it back. null falls through to
        // the polled on-chain figure; Number(undefined) would render as NaN.
        const granted = Number(data.votingPower);
        setGrantedVotes(Number.isFinite(granted) ? granted : null);
        setState(data.alreadyVoter ? "already-has-votes" : "granted");
        return;
      }

      setClaimErrorCode(data.code ?? "chain_error");
      setState("claim-error");
    } catch {
      setClaimErrorCode("chain_error");
      setState("claim-error");
    } finally {
      claimInFlightRef.current = false;
    }
  };

  const rowStatus = (row: StatusRow): RequirementRowStatus =>
    state === "council-unavailable"
      ? "unavailable"
      : state === "no-wallet"
        ? "unchecked"
        : state === "list-loading"
          ? "pending"
          : row.status;

  const showsRequirementList =
    state === "list-loading" ||
    state === "list-resolved" ||
    state === "no-wallet" ||
    state === "claiming-signing" ||
    state === "claiming-pending" ||
    state === "claim-error" ||
    state === "council-unavailable";

  const isClaiming =
    state === "claiming-signing" || state === "claiming-pending";

  const votesLabel = (votes: number) =>
    `${votes} ${votes === 1 ? "vote" : "votes"}`;

  return (
    <Modal
      show={show}
      centered
      onHide={onHide}
      scrollable
      onExited={() => {
        setState("list-loading");
        setRows([]);
        setCurrentVotes(0);
        setGrantedVotes(null);
        setClaimErrorCode(null);
      }}
    >
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">
          Voter eligibility
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4 pt-0">
        {state === "already-has-votes" ? (
          <Stack direction="vertical" gap={3}>
            <span>
              You have{" "}
              <span className="fw-semi-bold">
                {grantedVotes ?? councilMember?.votingPower}
              </span>{" "}
              votes in this council.
            </span>
            {rows.length > 0 &&
            currentVotes > 0 &&
            claimableVotes <= currentVotes ? (
              <span className="text-info">
                That&apos;s the highest allocation you currently qualify for.
              </span>
            ) : null}
          </Stack>
        ) : null}

        {state === "granted" ? (
          <Stack direction="vertical" gap={3}>
            <Alert variant="success" className="mb-0">
              {currentVotes > 0 ? (
                <>
                  Your votes increased to{" "}
                  <span className="fw-semi-bold">{grantedVotes}</span>.
                </>
              ) : (
                <>
                  You received{" "}
                  <span className="fw-semi-bold">{grantedVotes}</span> votes.
                </>
              )}
            </Alert>
          </Stack>
        ) : null}

        {state === "no-requirements" ? (
          <span className="text-info">
            This council has no NFT requirements configured.
          </span>
        ) : null}

        {showsRequirementList ? (
          <Stack direction="vertical" gap={3}>
            <span className="text-info">
              Ways to earn votes in this council:
            </span>

            {state === "council-unavailable" ? (
              <Alert variant="warning" className="mb-0">
                Claiming is temporarily unavailable for this council. An admin
                needs to grant the Flow State bot permission to add voters.
              </Alert>
            ) : null}

            {rows.length > 0
              ? rows.map((row) => (
                  <EligibilityRequirementRow
                    key={row.groupId}
                    name={row.name}
                    votes={row.votes}
                    status={rowStatus(row)}
                    acquisitionUrl={acquisitionUrlFor(row.groupId)}
                    onRetry={loadStatus}
                  />
                ))
              : requirements.map((requirement) => (
                  <EligibilityRequirementRow
                    key={requirement.groupId}
                    name={requirement.name}
                    votes={requirement.defaultVotingPower}
                    status={state === "no-wallet" ? "unchecked" : "pending"}
                    acquisitionUrl={requirement.nftAcquisitionUrl}
                  />
                ))}

            {state !== "council-unavailable" &&
            currentVotes > 0 &&
            claimableVotes > currentVotes ? (
              <span>
                You have {votesLabel(currentVotes)} and qualify for{" "}
                <span className="fw-semi-bold">
                  {votesLabel(claimableVotes)}
                </span>
                .
              </span>
            ) : metRows.length > 1 && state !== "council-unavailable" ? (
              <span>
                You&apos;ll receive{" "}
                <span className="fw-semi-bold">
                  {votesLabel(claimableVotes)}
                </span>
                , the highest you qualify for.
              </span>
            ) : null}

            {claimErrorCode ? (
              <Alert variant="danger" className="mb-0">
                {CLAIM_ERROR_COPY[claimErrorCode] ??
                  CLAIM_ERROR_COPY.chain_error}
              </Alert>
            ) : null}
          </Stack>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="border-0 p-4 pt-0">
        <Button
          variant="secondary"
          className="rounded-4 px-4 py-2 fw-semi-bold"
          onClick={onHide}
        >
          Close
        </Button>

        {state === "already-has-votes" || state === "granted" ? (
          <Button
            variant="primary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => {
              onHide();
              dispatchShowBallot({ type: "show" });
            }}
          >
            View Ballot
          </Button>
        ) : null}

        {state === "no-wallet" ? (
          <Button
            variant="primary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={() => openConnectModal?.()}
          >
            Connect Wallet
          </Button>
        ) : null}

        {(state === "list-resolved" || state === "claim-error" || isClaiming) &&
        claimableVotes > currentVotes ? (
          <Button
            variant="primary"
            className="rounded-4 px-4 py-2 fw-semi-bold"
            onClick={handleClaim}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <>
                <Spinner size="sm" className="me-2" />
                {state === "claiming-signing" ? "Signing..." : "Granting..."}
              </>
            ) : (
              `Claim ${votesLabel(claimableVotes)}`
            )}
          </Button>
        ) : null}
      </Modal.Footer>
    </Modal>
  );
}
