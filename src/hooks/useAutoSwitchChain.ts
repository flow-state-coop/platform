import { useEffect, useState } from "react";
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
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isDocumentVisible = useIsDocumentVisible();

  useEffect(() => {
    if (address && isDocumentVisible && connectedChain?.id !== chainId) {
      switchChain({ chainId });
    }
  }, [address, connectedChain, chainId, isDocumentVisible, switchChain]);
}
