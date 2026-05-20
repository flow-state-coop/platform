import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDisconnect } from "wagmi";
import { useSession } from "next-auth/react";
import Dropdown from "react-bootstrap/Dropdown";
import Stack from "react-bootstrap/Stack";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";

function UnreadBadge({
  count,
  ariaLabel,
}: {
  count: number;
  ariaLabel?: string;
}) {
  return (
    <span
      className="d-inline-flex align-items-center justify-content-center fw-bold text-white bg-danger rounded-circle"
      style={{ width: 22, height: 22, fontSize: 12, lineHeight: 1 }}
      aria-label={ariaLabel}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AccountDropdown({
  fallbackDisplayName,
  hideNameOnMobile,
}: {
  fallbackDisplayName: string;
  hideNameOnMobile?: boolean;
}) {
  const { disconnect } = useDisconnect();
  const { isMobile } = useMediaQuery();
  const { displayName: profileDisplayName } = useProfileDisplayName();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const pathname = usePathname();

  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const lastUnreadFetchRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setInboxUnreadCount(0);
      lastUnreadFetchRef.current = 0;
      return;
    }
    let cancelled = false;
    const refetch = async (force = false) => {
      // Throttle navigation-triggered re-syncs: pathname is a dep so the
      // effect re-runs on every client-side navigation. The
      // inbox:unread-changed event passes force=true to bypass the window.
      const now = Date.now();
      if (!force && now - lastUnreadFetchRef.current < 30_000) return;
      lastUnreadFetchRef.current = now;
      try {
        const res = await fetch("/api/flow-council/inbox/unread-count");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data?.unreadCount === "number") {
          setInboxUnreadCount(data.unreadCount);
        }
      } catch (err) {
        console.error(err);
      }
    };
    refetch();
    const onUnreadChanged = () => refetch(true);
    window.addEventListener("inbox:unread-changed", onUnreadChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("inbox:unread-changed", onUnreadChanged);
    };
  }, [isAuthenticated, pathname]);

  const nameElement = (
    <span className="fw-semi-bold sensitive">
      {profileDisplayName ?? fallbackDisplayName}
    </span>
  );

  const hasUnread = inboxUnreadCount > 0;

  return (
    <Dropdown align={{ md: "start" }}>
      <Dropdown.Toggle
        bsPrefix="dropdown"
        variant="outline-dark"
        className="d-flex align-items-center gap-2 px-10 py-4 border-4 rounded-4"
        style={{ whiteSpace: "nowrap" }}
      >
        {hasUnread ? (
          <UnreadBadge
            count={inboxUnreadCount}
            ariaLabel={`${inboxUnreadCount} unread`}
          />
        ) : (
          <span
            className="icon-currentcolor"
            role="img"
            aria-label="account"
            style={{
              width: 18,
              height: 18,
              WebkitMaskImage: "url(/account-circle.svg)",
              maskImage: "url(/account-circle.svg)",
            }}
          />
        )}
        {(!hideNameOnMobile || !isMobile) && nameElement}
      </Dropdown.Toggle>
      <Dropdown.Menu className="py-0 border-4 border-dark overflow-hidden">
        <Link href="/profile" className="text-decoration-none">
          <Dropdown.Item as="span" className="p-3 fw-semi-bold text-dark">
            Profile
          </Dropdown.Item>
        </Link>
        <Link href="/inbox" className="text-decoration-none">
          <Dropdown.Item
            as="span"
            className="p-3 fw-semi-bold text-dark d-flex align-items-center gap-2"
          >
            Inbox
            {hasUnread && <UnreadBadge count={inboxUnreadCount} />}
          </Dropdown.Item>
        </Link>
        <Link href="/projects" className="text-decoration-none">
          <Dropdown.Item as="span" className="p-3 fw-semi-bold text-dark">
            Projects
          </Dropdown.Item>
        </Link>
        <Dropdown.Item
          className="gap-2 p-3 fw-semi-bold text-dark"
          onClick={() => disconnect()}
        >
          <Stack direction="horizontal" gap={2} className="align-items-center">
            Disconnect
            <Image src="/logout.svg" alt="Disconnect" width={24} height={24} />
          </Stack>
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
