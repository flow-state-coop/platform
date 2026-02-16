"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import MessageItem, { Message, AuthorAffiliation } from "./chat/MessageItem";
import MessageInput from "./chat/MessageInput";
import EditMessageModal from "./chat/EditMessageModal";
import { useEnsResolution } from "@/hooks/useEnsResolution";

type RoundFeedMessage = Message & {
  channelType: string;
  projectId: number | null;
};

type RoundFeedViewProps = {
  chainId: number;
  councilId: string;
  roundId?: number;
  isAdmin: boolean;
  currentUserAddress?: string;
  showEmailCheckbox?: boolean;
};

export default function RoundFeedView(props: RoundFeedViewProps) {
  const {
    chainId,
    councilId,
    roundId,
    isAdmin,
    currentUserAddress,
    showEmailCheckbox = false,
  } = props;

  const [messages, setMessages] = useState<RoundFeedMessage[]>([]);
  const [affiliations, setAffiliations] = useState<
    Record<string, AuthorAffiliation>
  >({});
  const [projectNames, setProjectNames] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [editingMessage, setEditingMessage] = useState<RoundFeedMessage | null>(
    null,
  );

  const { data: session } = useSession();

  const authorAddresses = useMemo(() => {
    return messages.map((m) => m.authorAddress);
  }, [messages]);

  const { ensByAddress } = useEnsResolution(authorAddresses);

  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        chainId: chainId.toString(),
        councilId,
      });
      const res = await fetch(`/api/flow-council/round-feed?${params}`);
      const data = await res.json();

      if (data.success) {
        setMessages(data.messages || []);
        setAffiliations(data.affiliations || {});
        setProjectNames(data.projectNames || {});
        setError("");
      } else {
        setMessages([]);
        setAffiliations({});
        setProjectNames({});
        setError(data.error || "Failed to load messages");
      }
    } catch (err) {
      console.error(err);
      setMessages([]);
      setError("Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  }, [chainId, councilId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSendMessage = async (content: string, sendEmail?: boolean) => {
    if (!session?.address) return;

    try {
      setIsSending(true);
      setError("");

      const res = await fetch("/api/flow-council/messages", {
        method: "POST",
        body: JSON.stringify({
          channelType: "PUBLIC_ROUND",
          chainId,
          councilId,
          roundId,
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

  const handleHideMessage = async (messageId: number) => {
    try {
      setError("");

      const res = await fetch("/api/flow-council/round-feed/hide", {
        method: "POST",
        body: JSON.stringify({ messageId, chainId, councilId }),
      });

      const data = await res.json();

      if (data.success) {
        fetchMessages();
      } else {
        setError(data.error || "Failed to hide message");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to hide message");
    }
  };

  const canEditMessage = (message: RoundFeedMessage): boolean => {
    if (message.channelType !== "PUBLIC_ROUND") return false;

    return (
      !!currentUserAddress &&
      message.authorAddress.toLowerCase() === currentUserAddress.toLowerCase()
    );
  };

  const canDeleteMessage = (message: RoundFeedMessage): boolean => {
    if (message.channelType !== "PUBLIC_ROUND") return false;
    if (!currentUserAddress) return false;

    const isAuthor =
      message.authorAddress.toLowerCase() === currentUserAddress.toLowerCase();

    return isAuthor || isAdmin;
  };

  const canHideMessage = (message: RoundFeedMessage): boolean => {
    return isAdmin && message.channelType === "PUBLIC_PROJECT";
  };

  const getProjectSource = (message: RoundFeedMessage): string | null => {
    if (message.channelType !== "PUBLIC_PROJECT" || !message.projectId) {
      return null;
    }
    return projectNames[message.projectId] || null;
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  const messageInput = isAdmin && (
    <MessageInput
      onSend={handleSendMessage}
      isSending={isSending}
      showEmailCheckbox={showEmailCheckbox}
      disabled={!session?.address}
      placeholder={
        session?.address
          ? "Write an announcement. Markdown is supported."
          : "Sign in to send messages"
      }
    />
  );

  return (
    <div>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {messageInput && <div className="mb-5">{messageInput}</div>}

      <div className="rounded-4 p-3 mb-4">
        {displayMessages.length === 0 ? (
          <p className="text-muted text-center mb-0">No announcements yet.</p>
        ) : (
          <Stack direction="vertical" gap={3}>
            {displayMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                ensData={ensByAddress?.[message.authorAddress.toLowerCase()]}
                affiliation={affiliations[message.authorAddress.toLowerCase()]}
                projectSource={getProjectSource(message)}
                canEdit={canEditMessage(message)}
                canDelete={canDeleteMessage(message)}
                canHide={canHideMessage(message)}
                onEdit={() => setEditingMessage(message)}
                onDelete={() => handleDeleteMessage(message.id)}
                onHide={() => handleHideMessage(message.id)}
              />
            ))}
          </Stack>
        )}
      </div>

      <EditMessageModal
        show={!!editingMessage}
        initialContent={editingMessage?.content || ""}
        onClose={() => setEditingMessage(null)}
        onSave={handleEditMessage}
      />
    </div>
  );
}
