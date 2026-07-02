"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Stack from "react-bootstrap/Stack";
import { Address, formatEther } from "viem";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import MarkeeModal, { MarkeeTab } from "./MarkeeModal";
import {
  DEFAULT_TOP_MESSAGE,
  FLOW_STATE_MARKEE_ADDRESS,
  MIN_INCREMENT,
  MONOSPACE_FONT,
  MarkeeLeaderboard,
  displayOwnerName,
  flaggedKey,
  parseFlowStateLeaderboard,
} from "../lib/markee";

// Give the Markee API time to index the confirmed transaction before refetching
const REFRESH_DELAY_MS = 3000;

export default function MarkeeSign() {
  const [leaderboard, setLeaderboard] = useState<MarkeeLeaderboard | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingReopenModal, setPendingReopenModal] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<MarkeeTab>("buy");
  const [message, setMessage] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [ethAmount, setEthAmount] = useState("");
  const [boostAmount, setBoostAmount] = useState("");
  const [selectedMarkee, setSelectedMarkee] = useState<Address | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingReopenRef = useRef(false);
  const hasTxSucceededRef = useRef(false);
  const trackedViewsRef = useRef<Set<string>>(new Set());

  const { openConnectModal, connectModalOpen } = useConnectModal();

  const fetchLeaderboard = useCallback(async () => {
    const res = await fetch("/api/markee/leaderboards").catch(() => null);

    if (res?.ok) {
      const data = await res.json().catch(() => null);
      const parsed = parseFlowStateLeaderboard(data);

      if (parsed) {
        setLeaderboard(parsed);
      }
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    fetch("/api/markee/moderation")
      .then((res) => res.json())
      .then((data) =>
        setFlagged(
          new Set(
            ((data.flagged ?? []) as string[]).map((entry) =>
              entry.toLowerCase(),
            ),
          ),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (
      !leaderboard?.topMessage ||
      !leaderboard.topMarkeeAddress ||
      trackedViewsRef.current.has(leaderboard.topMarkeeAddress)
    ) {
      return;
    }

    trackedViewsRef.current.add(leaderboard.topMarkeeAddress);
    fetch("/api/markee/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: leaderboard.topMarkeeAddress,
        message: leaderboard.topMessage,
      }),
    }).catch(() => {});
  }, [leaderboard]);

  useEffect(() => {
    if (pendingReopenModal && !connectModalOpen) {
      // Deferred so the Escape keypress that closed the connect modal can't
      // also cancel the freshly reopened dialog through its default action
      const reopenTimeout = setTimeout(() => {
        dialogRef.current?.showModal();
        pendingReopenRef.current = false;
        setPendingReopenModal(false);
      }, 0);

      return () => clearTimeout(reopenTimeout);
    }
  }, [pendingReopenModal, connectModalOpen]);

  const handleConnectWallet = useCallback(() => {
    pendingReopenRef.current = true;
    setPendingReopenModal(true);
    dialogRef.current?.close();
    openConnectModal?.();
  }, [openConnectModal]);

  const handleTxSuccess = useCallback(() => {
    hasTxSucceededRef.current = true;
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    dialogRef.current?.showModal();
  };

  const handleRequestClose = () => dialogRef.current?.close();

  const handleDialogClose = () => {
    if (pendingReopenRef.current) {
      return;
    }

    setIsModalOpen(false);

    if (hasTxSucceededRef.current) {
      hasTxSucceededRef.current = false;
      setActiveTab("buy");
      setMessage("");
      setBuyerName("");
      setEthAmount("");
      setBoostAmount("");
      setSelectedMarkee(null);
      setTimeout(fetchLeaderboard, REFRESH_DELAY_MS);
    }
  };

  const hasTopMessage = leaderboard !== null && leaderboard.topMessage !== "";
  const isTopFlagged =
    leaderboard !== null &&
    leaderboard.topMarkeeAddress !== "" &&
    flagged.has(flaggedKey(leaderboard.topMarkeeAddress));
  const takeTopSpotWei =
    leaderboard !== null
      ? leaderboard.topFundsAdded > 0n
        ? leaderboard.topFundsAdded + MIN_INCREMENT
        : leaderboard.minimumPrice
      : null;
  const priceBadge =
    leaderboard !== null && takeTopSpotWei !== null
      ? hasTopMessage
        ? `${parseFloat(formatEther(takeTopSpotWei)).toFixed(3)} ETH to change`
        : "be first!"
      : null;
  const displayMessage = isTopFlagged
    ? "Content unavailable"
    : hasTopMessage
      ? leaderboard.topMessage
      : DEFAULT_TOP_MESSAGE;
  const ownerName =
    !isTopFlagged && hasTopMessage && leaderboard.topMessageOwner
      ? displayOwnerName(leaderboard.topMessageOwner)
      : null;

  return (
    <div data-markee-address={FLOW_STATE_MARKEE_ADDRESS}>
      <button
        type="button"
        disabled={isLoading}
        className="d-block w-100 text-start text-dark bg-transparent border border-2 border-dark rounded-4 shadow-sm px-3 py-2 mb-4"
        onClick={handleOpenModal}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Stack direction="vertical" gap={1}>
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between align-items-center"
          >
            <span className="fw-bold" style={{ fontSize: 13 }}>
              <span className="me-1" style={{ fontSize: 15 }}>
                📣
              </span>
              Flow State Markee
            </span>
            {priceBadge && (
              <span
                className="bg-primary text-white fw-semi-bold rounded-pill px-3 py-1 text-nowrap flex-shrink-0"
                style={{
                  fontSize: 12,
                  opacity: isHovered ? 1 : 0,
                  transition: "opacity 0.15s ease-in-out",
                }}
              >
                {priceBadge}
              </span>
            )}
          </Stack>
          <span
            style={{
              fontFamily: MONOSPACE_FONT,
              fontSize: 14,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
              whiteSpace: "pre-wrap",
              maxHeight: "6em",
            }}
          >
            {displayMessage}
          </span>
          {ownerName && (
            <span className="text-secondary" style={{ fontSize: 12 }}>
              — {ownerName}
            </span>
          )}
        </Stack>
      </button>
      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        className="markee-dialog border-0 rounded-4 p-0 shadow"
        style={{ width: "min(620px, 94vw)", maxHeight: "90vh" }}
      >
        {isModalOpen && (
          <MarkeeModal
            topMessage={leaderboard?.topMessage ?? ""}
            topMessageOwner={leaderboard?.topMessageOwner ?? ""}
            takeTopSpotWei={hasTopMessage ? takeTopSpotWei : null}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            message={message}
            onMessageChange={setMessage}
            buyerName={buyerName}
            onBuyerNameChange={setBuyerName}
            ethAmount={ethAmount}
            onEthAmountChange={setEthAmount}
            boostAmount={boostAmount}
            onBoostAmountChange={setBoostAmount}
            selectedMarkee={selectedMarkee}
            onSelectMarkee={setSelectedMarkee}
            flagged={flagged}
            onConnectWallet={handleConnectWallet}
            onClose={handleRequestClose}
            onTxSuccess={handleTxSuccess}
          />
        )}
      </dialog>
    </div>
  );
}
