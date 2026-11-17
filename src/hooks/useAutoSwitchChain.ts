import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";

function useIsDocumentVisible() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const update = () => setIsVisible(document.visibilityState === "visible");

    update();
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return isVisible;
}

export function useAutoSwitchChain(chainId: number) {
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isDocumentVisible = useIsDocumentVisible();
  const attemptedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!address || !isDocumentVisible) {
      return;
    }

    const attemptKey = `${address}-${chainId}`;

    if (attemptedKeyRef.current === attemptKey) {
      return;
    }

    attemptedKeyRef.current = attemptKey;

    if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    }
  }, [address, connectedChain, chainId, isDocumentVisible, switchChain]);
}
