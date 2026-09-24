"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useMediaQuery } from "@/hooks/mediaQuery";
import MarkeeModal from "./MarkeeModal";
import { useMarkeeBoard } from "../hooks/markee";
import {
  DEFAULT_TOP_MESSAGE,
  FLOW_STATE_MARKEE_ADDRESS,
  MARKEE_VIEWS_URL,
  MARKEE_WATERMARK_URL,
  displayOwnerName,
  flaggedKey,
  formatEthAmountInput,
  monthlyToWin,
} from "../lib/markee";

// Give the Markee API time to index the confirmed transaction before refetching
const REFRESH_DELAY_MS = 3000;

// POST answers with the tracked markee's totals, GET keys them by address
type ViewsTotal = { totalViews?: number };
type ViewsByAddress = Record<string, ViewsTotal | undefined>;
type ViewsResponse = ViewsTotal | ViewsByAddress;

export default function MarkeeSign() {
  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingReopenModal, setPendingReopenModal] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [modalKey, setModalKey] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingReopenRef = useRef(false);
  const hasTxSucceededRef = useRef(false);
  const trackedViewsRef = useRef<Set<string>>(new Set());

  const board = useMarkeeBoard();
  const { isMobile } = useMediaQuery();
  const { openConnectModal, connectModalOpen } = useConnectModal();

  const topEntry = board.topEntry;
  const topAddress = topEntry?.address ?? null;
  const topMessage = topEntry?.message ?? null;

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
    if (!topAddress || !topMessage) {
      return;
    }

    const key = topAddress.toLowerCase();
    const applyCount = (data: ViewsResponse | null) => {
      const totals =
        data && key in data
          ? (data as ViewsByAddress)[key]
          : (data as ViewsTotal | null);

      if (typeof totals?.totalViews === "number") {
        setViewCount(totals.totalViews);
      }
    };

    const request = trackedViewsRef.current.has(key)
      ? fetch(`${MARKEE_VIEWS_URL}?addresses=${key}`)
      : fetch(MARKEE_VIEWS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: topAddress,
            message: topMessage,
            url: window.location.origin,
          }),
        });

    trackedViewsRef.current.add(key);
    request
      .then((res) => (res.ok ? res.json() : null))
      .then(applyCount)
      .catch(() => {});
  }, [topAddress, topMessage]);

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
      setModalKey((key) => key + 1);
      setTimeout(board.refetch, REFRESH_DELAY_MS);
    }
  };

  const isTopFlagged =
    topEntry !== null && flagged.has(flaggedKey(topEntry.address));
  const priceBadge = board.isLoading
    ? null
    : topEntry !== null && board.minimumMonthlyRate !== null
      ? `${formatEthAmountInput(
          monthlyToWin(topEntry.rate, 0n, board.minimumMonthlyRate),
        )} ETH/mo to back`
      : "be first!";
  const displayMessage = isTopFlagged
    ? "Content unavailable"
    : (topEntry?.message ?? DEFAULT_TOP_MESSAGE);
  const ownerName =
    !isTopFlagged && topEntry !== null
      ? displayOwnerName(topEntry.name || topEntry.owner)
      : null;

  return (
    <div data-markee-address={FLOW_STATE_MARKEE_ADDRESS} className="mb-8">
      <button
        type="button"
        disabled={board.isLoading}
        className="d-block w-100 text-start text-dark bg-white border rounded-4 px-4 pt-3 pb-4"
        style={{
          position: "relative",
          zIndex: 0,
          borderColor: isHovered ? "var(--bs-primary)" : "rgba(3, 3, 3, 0.2)",
          transform: isHovered ? "translateY(-2px)" : "none",
          boxShadow: isHovered ? "var(--bs-box-shadow)" : "none",
          transition: "border-color 220ms, transform 220ms, box-shadow 220ms",
        }}
        onClick={handleOpenModal}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: -1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            src={MARKEE_WATERMARK_URL}
            alt=""
            aria-hidden
            style={{
              height: "100%",
              width: "auto",
              opacity: isHovered ? 0.16 : 0,
              transition: "opacity 220ms",
            }}
          />
        </div>
        <Stack
          direction="horizontal"
          className="justify-content-between align-items-center"
        >
          <span className="fw-bold" style={{ fontSize: 13 }}>
            <span className="me-1" style={{ fontSize: 15 }}>
              📣
            </span>
            Flow State Markee
          </span>
          {viewCount !== null && (
            <span
              className="d-flex align-items-center gap-1 text-secondary"
              style={{ fontSize: 12 }}
            >
              <Image
                src="/view.svg"
                alt="views"
                width={16}
                height={16}
                style={{ opacity: 0.6 }}
              />
              {viewCount}
            </span>
          )}
        </Stack>
        <span
          className="d-block fw-bold mt-2"
          style={{
            fontSize: isMobile ? 22 : 28,
            lineHeight: 1.2,
            backgroundImage:
              "linear-gradient(90deg, var(--bs-dark), var(--bs-primary))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          {displayMessage}
        </span>
        {ownerName && (
          <span
            className="d-block text-end text-secondary mt-2"
            style={{ fontSize: 13 }}
          >
            - {ownerName}
          </span>
        )}
        {priceBadge && (
          <span
            className="bg-primary text-white fw-semi-bold rounded-pill px-3 py-1 text-nowrap"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -14,
              fontSize: 12,
              opacity: isHovered ? 1 : 0,
              transform: `translate(-50%, ${isHovered ? 0 : 6}px)`,
              transition: "opacity 220ms, transform 220ms",
              pointerEvents: "none",
            }}
          >
            {priceBadge}
          </span>
        )}
      </button>
      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        className="markee-dialog border-0 rounded-4 p-0 shadow"
        style={{ width: "min(620px, 94vw)", maxHeight: "90vh" }}
      >
        <MarkeeModal
          key={modalKey}
          isOpen={isModalOpen}
          board={board}
          flagged={flagged}
          onConnectWallet={handleConnectWallet}
          onClose={handleRequestClose}
          onTxSuccess={handleTxSuccess}
        />
      </dialog>
    </div>
  );
}
