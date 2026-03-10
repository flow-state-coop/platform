import { useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { getCsrfToken, useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import useSiwe from "./siwe";

let latestAuthRequestId = 0;

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
        const id = ++latestAuthRequestId;
        pendingRef.current = { id, callback: onAuthed };
        return false;
      }
      if (!hasSession) {
        getCsrfToken()
          .then((token) => {
            if (token) handleSignIn(token);
          })
          .catch(console.error);
        const id = ++latestAuthRequestId;
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
      if (pendingRef.current.id === latestAuthRequestId) {
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
