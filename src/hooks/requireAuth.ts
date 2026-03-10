import { useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { getCsrfToken, useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import useSiwe from "./siwe";

let latestPendingId = 0;

export default function useRequireAuth() {
  const { address } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();

  const hasSession = !!session && session.address === address;
  const pendingRef = useRef<{ id: number; callback: () => void } | null>(null);

  const requireAuth = useCallback(
    (onAuthed: () => void): boolean => {
      if (!address) {
        openConnectModal?.();
        const id = ++latestPendingId;
        pendingRef.current = { id, callback: onAuthed };
        return false;
      }
      if (!hasSession) {
        getCsrfToken().then((token) => {
          if (token) handleSignIn(token);
        });
        const id = ++latestPendingId;
        pendingRef.current = { id, callback: onAuthed };
        return false;
      }
      onAuthed();
      return true;
    },
    [address, openConnectModal, hasSession, handleSignIn],
  );

  useEffect(() => {
    if (hasSession && pendingRef.current) {
      if (pendingRef.current.id === latestPendingId) {
        pendingRef.current.callback();
      }
      pendingRef.current = null;
    }
  }, [hasSession]);

  useEffect(() => {
    pendingRef.current = null;
  }, [address]);

  return { hasSession, address, requireAuth };
}
