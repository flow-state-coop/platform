import { Address, parseAbi } from "viem";
import { useReadContract } from "wagmi";

const realtimeBalanceOfNowAbi = parseAbi([
  "function realtimeBalanceOfNow(address) returns (int256,uint256,uint256,uint256)",
]);

export default function useSuperTokenBalanceOfNow({
  token,
  address,
  chainId,
}: {
  token?: string;
  address?: string;
  chainId: number;
}) {
  const { data: realtimeBalanceOfNow } = useReadContract({
    address: token as Address,
    functionName: "realtimeBalanceOfNow",
    abi: realtimeBalanceOfNowAbi,
    args: [address as Address],
    chainId,
    query: {
      enabled: !!token && !!address,
      refetchInterval: 10000,
    },
  });
  const balanceUntilUpdatedAt = realtimeBalanceOfNow?.[0];
  const updatedAtTimestamp = realtimeBalanceOfNow
    ? Number(realtimeBalanceOfNow[3])
    : null;

  return { balanceUntilUpdatedAt, updatedAtTimestamp };
}
