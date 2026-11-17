import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";

function useIsDocumentVisible() {
  const [isVisible, setIsVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const update = () => setIsVisible(document.visibilityState === "visible");

    update();
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return isVisible;
}

export function useAutoSwitchChain(chainId: number) {
  const { address, chain: connectedChain, status } = useAccount();
  const { switchChain } = useSwitchChain();
  const isDocumentVisible = useIsDocumentVisible();
  const connectedChainId = connectedChain?.id;
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    hasAttemptedRef.current = false;
  }, [connectedChainId, isDocumentVisible, chainId]);

  useEffect(() => {
    if (
      !address ||
      status !== "connected" ||
      !isDocumentVisible ||
      hasAttemptedRef.current ||
      connectedChainId === chainId
    ) {
      return;
    }

    hasAttemptedRef.current = true;
    switchChain({ chainId });
  }, [
    address,
    status,
    connectedChainId,
    chainId,
    isDocumentVisible,
    switchChain,
  ]);
}
