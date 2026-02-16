"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import MessageItem, { Message, AuthorAffiliation } from "./chat/MessageItem";
import MessageInput from "./chat/MessageInput";
import EditMessageModal from "./chat/EditMessageModal";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import { ChannelType } from "@/generated/kysely";

type ChatViewProps = {
  // Required identifiers
  channelType: ChannelType;
  chainId: number;
  councilId: string;

  // Context identifiers (varies by channel type)
  roundId?: number;
  applicationId?: number;
  projectId?: number;

  // Access control (determined by parent based on channel type)
  canWrite: boolean;
  canModerate: boolean;

  // User info
  currentUserAddress?: string; // undefined for public read-only

  // UI options
  showEmailCheckbox?: boolean;
  emptyMessage?: string;
  infoText?: string;
  newestFirst?: boolean;
  active?: boolean;
};

export default function ChatView(props: ChatViewProps) {
  const {
    channelType,
    chainId,
    councilId,
    roundId,
    applicationId,
    projectId,
    canWrite,
    canModerate,
    currentUserAddress,
    showEmailCheckbox = false,
    emptyMessage = "No messages yet.",
    infoText,
    newestFirst = false,
    active,
  } = props;

  const [messages, setMessages] = useState<Message[]>([]);
  const [affiliations, setAffiliations] = useState<
    Record<string, AuthorAffiliation>
  >({});
  const [projectLogos, setProjectLogos] = useState<
    Record<number, string | null>
  >({});
  const [managedProjectIds, setManagedProjectIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  // Edit modal state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const { data: session } = useSession();
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Get unique author addresses for ENS resolution
  const authorAddresses = useMemo(() => {
    return messages.map((m) => m.authorAddress);
  }, [messages]);

  const { ensByAddress } = useEnsResolution(authorAddresses);

  const displayMessages = useMemo(
    () => (newestFirst ? [...messages].reverse() : messages),
    [messages, newestFirst],
  );

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams({
      channelType,
      chainId: chainId.toString(),
      councilId,
    });

    if (roundId) params.set("roundId", roundId.toString());
    if (applicationId) params.set("applicationId", applicationId.toString());
    if (projectId) params.set("projectId", projectId.toString());

    return params.toString();
  }, [channelType, chainId, councilId, roundId, applicationId, projectId]);

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/flow-council/messages?${buildQueryParams()}`,
      );
      const data = await res.json();

      if (data.success) {
        setMessages(data.messages || []);
        setAffiliations(data.affiliations || {});
        setProjectLogos(data.projectLogos || {});
        setManagedProjectIds(data.managedProjectIds || []);
        setError("");
      } else {
        setMessages([]);
        setAffiliations({});
        setProjectLogos({});
        setManagedProjectIds([]);
        setError(data.error || "Failed to load messages");
      }
    } catch (err) {
      console.error(err);
      setMessages([]);
      setError("Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      fetchMessages();
    }
    prevActiveRef.current = active;
  }, [active, fetchMessages]);

  useEffect(() => {
    if (newestFirst) return;

    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, newestFirst]);

  const handleSendMessage = async (content: string, sendEmail?: boolean) => {
    if (!session?.address) return;

    try {
      setIsSending(true);
      setError("");

      const res = await fetch("/api/flow-council/messages", {
        method: "POST",
        body: JSON.stringify({
          channelType,
          chainId,
          councilId,
          roundId,
          applicationId,
          projectId,
          content,
          sendEmail,
        }),
      });

      const data = await res.json();

      if (data.success) {
        fetchMessages();
      } else {
        setError(data.error || "Failed to send message");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleEditMessage = async (content: string) => {
    if (!editingMessage) return;

    const res = await fetch(`/api/flow-council/messages/${editingMessage.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to edit message");
    }

    fetchMessages();
    setEditingMessage(null);
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!window.confirm("Are you sure you want to delete this message?")) {
      return;
    }

    try {
      setError("");

      const res = await fetch(`/api/flow-council/messages/${messageId}`, {
        method: "DELETE",
        body: JSON.stringify({ chainId, councilId }),
      });

      const data = await res.json();

      if (data.success) {
        fetchMessages();
      } else {
        setError(data.error || "Failed to delete message");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to delete message");
    }
  };

  const canEditMessage = (message: Message): boolean => {
    if (message.messageType === "milestone_update") return false;
    return (
      !!currentUserAddress &&
      message.authorAddress.toLowerCase() === currentUserAddress.toLowerCase()
    );
  };

  const canDeleteMessage = (message: Message): boolean => {
    if (!currentUserAddress) return false;

    const isAuthor =
      message.authorAddress.toLowerCase() === currentUserAddress.toLowerCase();

    if (
      message.messageType === "milestone_update" &&
      message.projectId &&
      managedProjectIds.includes(message.projectId)
    ) {
      return true;
    }

    return isAuthor || canModerate;
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  const messageInput = canWrite && (
    <MessageInput
      onSend={handleSendMessage}
      isSending={isSending}
      showEmailCheckbox={showEmailCheckbox}
      disabled={!session?.address}
      placeholder={
        session?.address
          ? "Write a message. Markdown is supported."
          : "Sign in to send messages"
      }
    />
  );

  return (
    <div>
      {infoText && <p className="text-muted mb-4">{infoText}</p>}

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {newestFirst && messageInput && (
        <div className="mb-5">{messageInput}</div>
      )}

      <div
        ref={messagesContainerRef}
        className="rounded-4 p-3 mb-4"
        style={newestFirst ? undefined : { maxHeight: 400, overflowY: "auto" }}
      >
        {displayMessages.length === 0 ? (
          <p className="text-muted text-center mb-0">{emptyMessage}</p>
        ) : (
          <Stack direction="vertical" gap={3}>
            {displayMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                ensData={ensByAddress?.[message.authorAddress.toLowerCase()]}
                affiliation={affiliations[message.authorAddress.toLowerCase()]}
                projectLogoUrl={
                  message.messageType === "milestone_update" &&
                  message.projectId
                    ? projectLogos[message.projectId]
                    : undefined
                }
                canEdit={canEditMessage(message)}
                canDelete={canDeleteMessage(message)}
                onEdit={() => setEditingMessage(message)}
                onDelete={() => handleDeleteMessage(message.id)}
              />
            ))}
          </Stack>
        )}
      </div>

      {!newestFirst && messageInput}

      <EditMessageModal
        show={!!editingMessage}
        initialContent={editingMessage?.content || ""}
        onClose={() => setEditingMessage(null)}
        onSave={handleEditMessage}
      />
    </div>
  );
}
