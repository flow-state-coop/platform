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
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const isDocumentVisible = useIsDocumentVisible();
  const wasRejectedRef = useRef(false);

  useEffect(() => {
    if (connectedChain?.id === chainId) {
      wasRejectedRef.current = false;
      return;
    }

    if (!address || !isDocumentVisible || wasRejectedRef.current) {
      return;
    }

    switchChain(
      { chainId },
      {
        onError: (error) => {
          if (error.name === "UserRejectedRequestError") {
            wasRejectedRef.current = true;
          }
        },
      },
    );
  }, [address, connectedChain, chainId, isDocumentVisible, switchChain]);
}
