import { createPublicClient, http, formatEther, parseEther } from "viem";
import { base } from "viem/chains";
import { networks } from "@/lib/networks";
import { FLOW_STATE_MARKEE_ADDRESS, type MarkeeInfo } from "./markee";

const LEADERBOARD_ABI = [
  {
    inputs: [],
    name: "minimumPrice",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "limit", type: "uint256" }],
    name: "getTopMarkees",
    outputs: [
      { name: "topAddresses", type: "address[]" },
      { name: "topFunds", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MARKEE_ABI = [
  {
    inputs: [],
    name: "message",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const MIN_INCREMENT = parseEther("0.001");

export async function getFlowStateMarkee(): Promise<MarkeeInfo | null> {
  try {
    const rpcUrl =
      networks.find((n) => n.id === base.id)?.rpcUrl ??
      "https://mainnet.base.org";
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl, { fetchOptions: { cache: "no-store" } }),
    });
    const leaderboard = FLOW_STATE_MARKEE_ADDRESS as `0x${string}`;

    const [priceRes, topRes] = await client.multicall({
      contracts: [
        { address: leaderboard, abi: LEADERBOARD_ABI, functionName: "minimumPrice" },
        {
          address: leaderboard,
          abi: LEADERBOARD_ABI,
          functionName: "getTopMarkees",
          args: [3n],
        },
      ],
    });

    if (topRes.status !== "success") return null;

    const minimumPrice =
      priceRes.status === "success" ? priceRes.result : 0n;
    const [topAddresses, topFunds] = topRes.result;
    const topIdx = topFunds.findIndex((f) => f > 0n);
    if (topIdx < 0 || !topAddresses[topIdx]) return null;

    const buyPrice =
      topFunds[topIdx] + MIN_INCREMENT > minimumPrice
        ? topFunds[topIdx] + MIN_INCREMENT
        : minimumPrice;

    const [msgRes, ownerRes] = await client.multicall({
      contracts: [
        { address: topAddresses[topIdx], abi: MARKEE_ABI, functionName: "message" },
        { address: topAddresses[topIdx], abi: MARKEE_ABI, functionName: "owner" },
      ],
    });

    const message = msgRes.status === "success" ? msgRes.result : "";
    if (!message) return null;

    return {
      message,
      owner: ownerRes.status === "success" ? ownerRes.result : "",
      priceEth: parseFloat(formatEther(buyPrice)).toFixed(3),
    };
  } catch {
    return null;
  }
}
