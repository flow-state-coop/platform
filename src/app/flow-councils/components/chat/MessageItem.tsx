"use client";

import Image from "next/image";
import Stack from "react-bootstrap/Stack";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import Markdown from "@/components/Markdown";
import ProfilePic from "./ProfilePic";
import MessageActions from "./MessageActions";
import ReactionBar, { type ReactionSummary } from "./ReactionBar";
import type { EnsData } from "@/hooks/useEnsResolution";

export type Message = {
  id: number;
  authorAddress: string;
  content: string;
  messageType?: string;
  projectId?: number;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthorAffiliation = {
  isAdmin: boolean;
  projectName: string | null;
};

type MessageItemProps = {
  message: Message;
  displayName?: string | null;
  ensData?: EnsData | null;
  affiliation?: AuthorAffiliation | null;
  projectLogoUrl?: string;
  projectSource?: string;
  hideAdminTag?: boolean;
  reactions?: ReactionSummary[];
  onReactionToggle?: (emoji: string) => void;
  isPinned?: boolean;
  canPin?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

const SYSTEM_ADDRESS = "0x0000000000000000000000000000000000000000";

function shortenAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isEdited(createdAt: string, updatedAt: string): boolean {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  // Allow 1 second tolerance for DB write timing
  return updated - created > 1000;
}

export default function MessageItem(props: MessageItemProps) {
  const {
    message,
    displayName: customDisplayName,
    ensData,
    affiliation,
    projectLogoUrl,
    projectSource,
    hideAdminTag,
    reactions,
    onReactionToggle,
    isPinned,
    canPin,
    onPin,
    onUnpin,
    canEdit,
    canDelete,
    onEdit,
    onDelete,
  } = props;

  const isMilestoneUpdate = message.messageType === "milestone_update";
  const isSystemMessage =
    !isMilestoneUpdate && message.authorAddress === SYSTEM_ADDRESS;
  const displayName = isMilestoneUpdate
    ? (projectSource ?? "Milestone Update")
    : isSystemMessage
      ? "System"
      : customDisplayName ||
        ensData?.name ||
        shortenAddress(message.authorAddress);
  const showAddressTooltip = !isMilestoneUpdate && !isSystemMessage;
  const edited = isEdited(message.createdAt, message.updatedAt);

  const affiliationTag =
    !isSystemMessage && !isMilestoneUpdate && affiliation
      ? affiliation.isAdmin && !hideAdminTag
        ? "(Admin)"
        : affiliation.projectName
          ? `(${affiliation.projectName})`
          : null
      : null;

  const effectiveCanEdit = isMilestoneUpdate ? false : canEdit;
  const showActions = !isSystemMessage && (canEdit || canDelete || canPin);

  return (
    <div
      className={`rounded-4 p-3 position-relative ${isSystemMessage ? "bg-secondary bg-opacity-10" : "bg-lace-100"}`}
    >
      {showActions && (
        <div className="position-absolute top-0 end-0 mt-2 me-2">
          <MessageActions
            canEdit={effectiveCanEdit}
            canDelete={canDelete}
            canPin={canPin}
            isPinned={isPinned}
            onEdit={onEdit}
            onDelete={onDelete}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        </div>
      )}
      {isPinned && (
        <div className="d-flex align-items-center gap-1 mb-1 ms-1 text-muted small">
          <Image
            src="/pin.svg"
            alt="Pinned"
            width={12}
            height={12}
            className="opacity-50"
          />
          Pinned
        </div>
      )}
      <Stack direction="horizontal" gap={2} className="mb-2">
        <ProfilePic
          address={message.authorAddress}
          ensAvatar={isSystemMessage ? undefined : ensData?.avatar}
          imageUrl={projectLogoUrl || undefined}
          size={32}
        />
        <div className="flex-grow-1 overflow-hidden pe-4">
          <div className="d-flex flex-wrap gap-1 align-items-center">
            <span className="d-flex gap-1 text-truncate">
              {showAddressTooltip ? (
                <OverlayTrigger
                  placement="top"
                  overlay={<Tooltip>{message.authorAddress}</Tooltip>}
                >
                  <span className="fw-semi-bold text-truncate">
                    {displayName}
                  </span>
                </OverlayTrigger>
              ) : (
                <span
                  className={`fw-semi-bold text-truncate ${isSystemMessage ? "fst-italic text-muted" : ""}`}
                >
                  {displayName}
                </span>
              )}
              {affiliationTag && (
                <span className="text-muted text-nowrap">{affiliationTag}</span>
              )}
            </span>
            <span className="text-muted small text-nowrap">
              {formatTimestamp(message.createdAt)}
              {edited && " (edited)"}
            </span>
          </div>
        </div>
      </Stack>
      <Markdown className={`mb-0 ms-5 ${isSystemMessage ? "fst-italic" : ""}`}>
        {message.content}
      </Markdown>
      {onReactionToggle && (
        <div className="ms-5">
          <ReactionBar
            reactions={reactions || []}
            onToggle={onReactionToggle}
          />
        </div>
      )}
    </div>
  );
}
