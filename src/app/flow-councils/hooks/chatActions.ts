import { useState, useMemo, useCallback } from "react";
import type { ReactionSummary } from "../components/chat/ReactionBar";

type PinnableMessage = {
  id: number;
  pinnedAt?: string | null;
};

type ChatActionsParams<T extends PinnableMessage> = {
  messages: T[];
  chainId?: number;
  councilId?: string;
  sessionAddress?: string;
  newestFirst?: boolean;
};

export function useChatActions<T extends PinnableMessage>({
  messages,
  chainId,
  councilId,
  sessionAddress,
  newestFirst = false,
}: ChatActionsParams<T>) {
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Record<number, ReactionSummary[]>>(
    {},
  );

  const setFetchedData = useCallback(
    (data: {
      displayNames?: Record<string, string>;
      reactions?: Record<number, ReactionSummary[]>;
    }) => {
      setDisplayNames(data.displayNames || {});
      setReactions(data.reactions || {});
    },
    [],
  );

  const clearData = useCallback(() => {
    setDisplayNames({});
    setReactions({});
  }, []);

  const displayMessages = useMemo(() => {
    const pinned = messages
      .filter((m) => m.pinnedAt)
      .sort(
        (a, b) =>
          new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime(),
      );
    const unpinned = messages.filter((m) => !m.pinnedAt);
    const orderedUnpinned = newestFirst ? [...unpinned].reverse() : unpinned;
    return [...pinned, ...orderedUnpinned];
  }, [messages, newestFirst]);

  const handlePin = useCallback(
    async (
      messageId: number,
      fetchMessages: () => void,
      setError: (e: string) => void,
    ) => {
      const pinnedCount = messages.filter((m) => m.pinnedAt).length;
      if (
        pinnedCount >= 3 &&
        !window.confirm(
          "There are already 3 pinned messages. The oldest pin will be replaced. Continue?",
        )
      ) {
        return;
      }

      try {
        setError("");
        const res = await fetch(`/api/flow-council/messages/${messageId}/pin`, {
          method: "POST",
          body: JSON.stringify({ chainId, councilId }),
        });
        const data = await res.json();

        if (data.success) {
          fetchMessages();
        } else {
          setError(data.error || "Failed to pin message");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to pin message");
      }
    },
    [messages, chainId, councilId],
  );

  const handleUnpin = useCallback(
    async (
      messageId: number,
      fetchMessages: () => void,
      setError: (e: string) => void,
    ) => {
      try {
        setError("");
        const res = await fetch(`/api/flow-council/messages/${messageId}/pin`, {
          method: "DELETE",
          body: JSON.stringify({ chainId, councilId }),
        });
        const data = await res.json();

        if (data.success) {
          fetchMessages();
        } else {
          setError(data.error || "Failed to unpin message");
        }
      } catch (err) {
        console.error(err);
        setError("Failed to unpin message");
      }
    },
    [chainId, councilId],
  );

  const handleReactionToggle = useCallback(
    async (messageId: number, emoji: string) => {
      if (!sessionAddress) return;

      const prev = reactions[messageId] || [];
      const existing = prev.find((r) => r.emoji === emoji);
      const optimistic = existing?.hasReacted
        ? prev
            .map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count - 1, hasReacted: false }
                : r,
            )
            .filter((r) => r.count > 0)
        : existing
          ? prev.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, hasReacted: true }
                : r,
            )
          : [...prev, { emoji, count: 1, hasReacted: true }];

      setReactions((r) => ({ ...r, [messageId]: optimistic }));

      try {
        const res = await fetch(
          `/api/flow-council/messages/${messageId}/reactions`,
          {
            method: "POST",
            body: JSON.stringify({ emoji, chainId, councilId }),
          },
        );
        const data = await res.json();

        if (!data.success) {
          setReactions((r) => ({ ...r, [messageId]: prev }));
        }
      } catch {
        setReactions((r) => ({ ...r, [messageId]: prev }));
      }
    },
    [sessionAddress, reactions, chainId, councilId],
  );

  return {
    displayNames,
    reactions,
    displayMessages,
    setFetchedData,
    clearData,
    handlePin,
    handleUnpin,
    handleReactionToggle,
  };
}
