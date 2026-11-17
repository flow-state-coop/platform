import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";

function useVisibleSessionCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") {
        setCount((prev) => prev + 1);
      }
    };

    update();
    document.addEventListener("visibilitychange", update);

    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return count;
}

export function useAutoSwitchChain(chainId: number) {
  const { address, chain: connectedChain, status } = useAccount();
  const { switchChain } = useSwitchChain();
  const visibleSessionCount = useVisibleSessionCount();
  const attemptedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!address || status !== "connected" || visibleSessionCount === 0) {
      return;
    }

    const attemptKey = `${address}-${chainId}-${visibleSessionCount}`;

    if (attemptedKeyRef.current === attemptKey) {
      return;
    }

    attemptedKeyRef.current = attemptKey;

    if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    }
  }, [
    address,
    status,
    connectedChain,
    chainId,
    visibleSessionCount,
    switchChain,
  ]);
}
