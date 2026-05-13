"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Container from "react-bootstrap/Container";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import Spinner from "react-bootstrap/Spinner";
import Alert from "react-bootstrap/Alert";
import useSiwe from "@/hooks/siwe";

type InboxCategory =
  | "application_eligibility"
  | "project_channels"
  | "round_announcements"
  | "internal_review"
  | "platform";

type InboxItem = {
  id: number;
  recipientAddress: string;
  messageId: number | null;
  applicationId: number | null;
  category: InboxCategory | string;
  sourceLabel: string | null;
  snippet: string | null;
  readAt: string | null;
  createdAt: string;
};

type InboxResponse = {
  success: true;
  items: InboxItem[];
  unreadCount: number;
};

type CategoryFilter = InboxCategory | "all";

const CATEGORY_LABELS: Record<InboxCategory, string> = {
  application_eligibility: "Applications",
  project_channels: "Project channels",
  round_announcements: "Announcements",
  internal_review: "Internal review",
  platform: "Platform",
};

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "application_eligibility", label: CATEGORY_LABELS.application_eligibility },
  { key: "project_channels", label: CATEGORY_LABELS.project_channels },
  { key: "round_announcements", label: CATEGORY_LABELS.round_announcements },
  { key: "internal_review", label: CATEGORY_LABELS.internal_review },
  { key: "platform", label: CATEGORY_LABELS.platform },
];

function getCategoryLabel(category: string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as InboxCategory];
  }
  return category;
}

function formatTimestamp(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getItemHref(item: InboxItem): string | null {
  if (item.applicationId != null) {
    return `/flow-councils/review?applicationId=${item.applicationId}`;
  }
  return null;
}

export default function InboxPage() {
  const { status } = useSession();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { handleSignIn } = useSiwe();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState<string>("");

  const fetchInbox = useCallback(
    async (category: CategoryFilter) => {
      if (status !== "authenticated") return;
      setIsLoading(true);
      setError("");
      try {
        const qs =
          category === "all" ? "" : `?category=${encodeURIComponent(category)}`;
        const res = await fetch(`/api/flow-council/inbox${qs}`);
        if (!res.ok) {
          setError("Failed to load inbox.");
          return;
        }
        const data = (await res.json()) as InboxResponse;
        setItems(data.items ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      } catch (err) {
        console.error(err);
        setError("Failed to load inbox.");
      } finally {
        setIsLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    if (status === "authenticated") {
      fetchInbox(selectedCategory);
    }
  }, [status, selectedCategory, fetchInbox]);

  const handleSelectCategory = (category: CategoryFilter) => {
    setSelectedCategory(category);
  };

  const handleItemClick = async (item: InboxItem) => {
    if (item.readAt) return;
    // optimistic update
    const nowIso = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, readAt: nowIso } : it)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/flow-council/inbox/${item.id}/read`, {
        method: "PATCH",
      });
      if (!res.ok) {
        // rollback
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, readAt: null } : it)),
        );
        setUnreadCount((prev) => prev + 1);
      }
    } catch (err) {
      console.error(err);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, readAt: null } : it)),
      );
      setUnreadCount((prev) => prev + 1);
    }
  };

  const handleMarkAllRead = async () => {
    if (isMarkingAll || unreadCount === 0) return;
    setIsMarkingAll(true);
    const nowIso = new Date().toISOString();
    const previousItems = items;
    const previousUnread = unreadCount;
    // optimistic update
    setItems((prev) =>
      prev.map((it) => (it.readAt ? it : { ...it, readAt: nowIso })),
    );
    setUnreadCount(0);
    try {
      const res = await fetch(`/api/flow-council/inbox/read-all`, {
        method: "POST",
      });
      if (!res.ok) {
        setItems(previousItems);
        setUnreadCount(previousUnread);
      }
    } catch (err) {
      console.error(err);
      setItems(previousItems);
      setUnreadCount(previousUnread);
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (status === "loading") {
    return (
      <Container className="py-5 d-flex justify-content-center">
        <Spinner />
      </Container>
    );
  }

  if (status === "unauthenticated") {
    return (
      <Container className="py-5" style={{ maxWidth: 600 }}>
        <h2 className="mb-4">Inbox</h2>
        <Card className="bg-lace-100 rounded-4 border-0 p-4 text-center">
          <p className="mb-4">Sign in to view your inbox.</p>
          <Button
            variant="primary"
            className="rounded-3 py-3 fw-bold align-self-center px-5"
            onClick={() => {
              if (!address && openConnectModal) {
                openConnectModal();
              } else {
                handleSignIn();
              }
            }}
          >
            {!address ? "Connect Wallet" : "Sign In With Ethereum"}
          </Button>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-5" style={{ maxWidth: 800 }}>
      <Stack
        direction="horizontal"
        gap={3}
        className="align-items-center justify-content-between mb-4 flex-wrap"
      >
        <h2 className="mb-0">
          Inbox
          {unreadCount > 0 && (
            <Badge bg="primary" className="ms-3 align-middle fs-6">
              {unreadCount} unread
            </Badge>
          )}
        </h2>
        <Button
          variant="outline-primary"
          className="rounded-3"
          onClick={handleMarkAllRead}
          disabled={isMarkingAll || unreadCount === 0}
        >
          {isMarkingAll ? <Spinner size="sm" /> : "Mark all read"}
        </Button>
      </Stack>

      <Stack
        direction="horizontal"
        gap={2}
        className="mb-4 flex-wrap"
        style={{ rowGap: "0.5rem" }}
      >
        {CATEGORY_FILTERS.map(({ key, label }) => {
          const isActive = selectedCategory === key;
          return (
            <Button
              key={key}
              variant={isActive ? "primary" : "outline-secondary"}
              className="rounded-pill px-3 py-2"
              size="sm"
              onClick={() => handleSelectCategory(key)}
            >
              {label}
            </Button>
          );
        })}
      </Stack>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <div className="d-flex justify-content-center py-5">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-lace-100 rounded-4 border-0 p-5 text-center">
          <p className="text-muted mb-0">No messages in this view.</p>
        </Card>
      ) : (
        <Stack gap={2}>
          {items.map((item) => {
            const isUnread = item.readAt === null;
            const href = getItemHref(item);
            const title =
              item.sourceLabel ?? getCategoryLabel(item.category);
            const rowContent = (
              <Card
                className={`rounded-4 border-0 p-3 ${
                  isUnread ? "bg-white shadow-sm" : "bg-lace-100"
                }`}
                role="button"
                tabIndex={0}
                onClick={() => handleItemClick(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleItemClick(item);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <Stack direction="horizontal" gap={3} className="align-items-start">
                  <span
                    aria-hidden="true"
                    className="d-inline-block rounded-circle mt-2"
                    style={{
                      width: 8,
                      height: 8,
                      backgroundColor: isUnread ? "var(--bs-primary)" : "transparent",
                      flexShrink: 0,
                    }}
                  />
                  <Stack gap={1} className="flex-grow-1 overflow-hidden">
                    <Stack
                      direction="horizontal"
                      gap={2}
                      className="align-items-center flex-wrap"
                    >
                      <span
                        className={isUnread ? "fw-bold" : "fw-semi-bold"}
                        style={{ wordBreak: "break-word" }}
                      >
                        {title}
                      </span>
                      <Badge
                        bg="light"
                        text="dark"
                        className="fw-normal border"
                      >
                        {getCategoryLabel(item.category)}
                      </Badge>
                    </Stack>
                    {item.snippet && (
                      <span
                        className="text-muted"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.snippet}
                      </span>
                    )}
                    <Stack
                      direction="horizontal"
                      gap={3}
                      className="align-items-center"
                    >
                      <small className="text-muted">
                        {formatTimestamp(item.createdAt)}
                      </small>
                      {href && (
                        <Link
                          href={href}
                          className="small text-primary text-decoration-none"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleItemClick(item);
                          }}
                        >
                          View
                        </Link>
                      )}
                    </Stack>
                  </Stack>
                </Stack>
              </Card>
            );
            return <div key={item.id}>{rowContent}</div>;
          })}
        </Stack>
      )}
    </Container>
  );
}
