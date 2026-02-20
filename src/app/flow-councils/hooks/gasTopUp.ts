import { useState, useEffect, useRef, useCallback } from "react";
import { parseEther } from "viem";
import { celo } from "viem/chains";
import { useBalance } from "wagmi";
import { GOODBUILDERS_COUNCIL_ADDRESSES } from "../lib/constants";

const GAS_THRESHOLD = parseEther("0.075");

export default function useGasTopUp(
  address: `0x${string}` | undefined,
  councilId: string,
  votingPower: number,
) {
  const [gasTopUpSuccess, setGasTopUpSuccess] = useState<boolean | null>(null);
  const hasRequestedRef = useRef(false);

  const isGoodBuildersCouncil = GOODBUILDERS_COUNCIL_ADDRESSES.includes(
    councilId.toLowerCase() as `0x${string}`,
  );

  const { data: balance } = useBalance({
    address,
    chainId: celo.id,
    query: {
      refetchInterval: 10_000,
      enabled: isGoodBuildersCouncil && !!address && votingPower > 0,
    },
  });

  useEffect(() => {
    if (
      !address ||
      !balance ||
      hasRequestedRef.current ||
      balance.value >= GAS_THRESHOLD
    ) {
      return;
    }

    hasRequestedRef.current = true;

    fetch("/api/good-dollar/gas-top-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    })
      .then((res) => res.json())
      .then((data) => setGasTopUpSuccess(data.success === true))
      .catch(() => setGasTopUpSuccess(false));
  }, [address, balance]);

  const dismissGasTopUp = useCallback(() => setGasTopUpSuccess(null), []);

  return { gasTopUpSuccess, dismissGasTopUp };
}
