import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";

const WALLET_REVERT_WINDOW_MS = 2000;

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
  const isSwitchRequestedRef = useRef(false);
  const switchLandedAtRef = useRef<number | null>(null);
  const hasGivenUpRef = useRef(false);

  useEffect(() => {
    if (isDocumentVisible) {
      isSwitchRequestedRef.current = false;
      hasGivenUpRef.current = false;
    }
  }, [isDocumentVisible]);

  useEffect(() => {
    if (connectedChainId === chainId) {
      switchLandedAtRef.current = isSwitchRequestedRef.current
        ? Date.now()
        : null;
    } else if (
      switchLandedAtRef.current !== null &&
      Date.now() - switchLandedAtRef.current < WALLET_REVERT_WINDOW_MS
    ) {
      hasGivenUpRef.current = true;
      switchLandedAtRef.current = null;
    }

    isSwitchRequestedRef.current = false;
  }, [connectedChainId, chainId]);

  useEffect(() => {
    if (
      !address ||
      status !== "connected" ||
      !isDocumentVisible ||
      isSwitchRequestedRef.current ||
      hasGivenUpRef.current ||
      connectedChainId === chainId
    ) {
      return;
    }

    isSwitchRequestedRef.current = true;
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
