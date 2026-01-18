"use client";

import Stack from "react-bootstrap/Stack";
import ProfilePic from "./ProfilePic";
import MessageActions from "./MessageActions";
import type { EnsData } from "@/hooks/useEnsResolution";

export type Message = {
  id: number;
  authorAddress: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type MessageItemProps = {
  message: Message;
  ensData?: EnsData | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

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
  const { message, ensData, canEdit, canDelete, onEdit, onDelete } = props;

  const displayName = ensData?.name || shortenAddress(message.authorAddress);
  const edited = isEdited(message.createdAt, message.updatedAt);

  return (
    <div className="bg-light rounded-4 p-3">
      <Stack direction="horizontal" gap={2} className="mb-2">
        <ProfilePic
          address={message.authorAddress}
          ensAvatar={ensData?.avatar}
          size={32}
        />
        <Stack
          direction="vertical"
          gap={0}
          className="flex-grow-1 overflow-hidden"
        >
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between"
          >
            <span className="fw-semi-bold text-truncate">{displayName}</span>
            <Stack
              direction="horizontal"
              gap={1}
              className="align-items-center"
            >
              <span className="text-muted small text-nowrap">
                {formatTimestamp(message.createdAt)}
                {edited && " (edited)"}
              </span>
              <MessageActions
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </Stack>
          </Stack>
        </Stack>
      </Stack>
      <p className="mb-0 ms-5" style={{ whiteSpace: "pre-wrap" }}>
        {message.content}
      </p>
    </div>
  );
}
