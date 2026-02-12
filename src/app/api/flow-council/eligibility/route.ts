import { Address, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "wagmi/chains";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import {
  GOODBUILDERS_COUNCIL_ADDRESSES,
  GOODDOLLAR_IDENTITY_ADDRESS,
} from "@/app/flow-councils/lib/constants";

export const dynamic = "force-dynamic";

const IDENTITY_ABI = [
  {
    type: "function",
    name: "isWhitelisted",
    inputs: [{ name: "_account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
] as const;

export async function POST(request: Request) {
  try {
    const { address, chainId, councilId } = await request.json();

    if (
      !address ||
      !chainId ||
      !councilId ||
      !GOODBUILDERS_COUNCIL_ADDRESSES.includes(councilId.toLowerCase())
    ) {
      return Response.json({ success: false, error: "Invalid request" });
    }

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return Response.json({ success: false, error: "Wrong network" });
    }

    const celoNetwork = networks.find((network) => network.id === 42220);
    const celoPublicClient = createPublicClient({
      chain: celo,
      transport: http(celoNetwork?.rpcUrl),
    });

    const isWhitelisted = await celoPublicClient.readContract({
      address: GOODDOLLAR_IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "isWhitelisted",
      args: [address as Address],
    });

    if (!isWhitelisted) {
      return Response.json({ success: false, error: "Not whitelisted" });
    }

    const account = privateKeyToAccount(
      process.env.FLOW_STATE_ELIGIBILITY_PK as `0x${string}`,
    );

    const publicClient = createPublicClient({
      chain: celo,
      transport: http(network.rpcUrl),
    });
    const walletClient = createWalletClient({
      chain: celo,
      transport: http(network.rpcUrl),
    });

    const hash = await walletClient.writeContract({
      account,
      address: councilId as Address,
      abi: flowCouncilAbi,
      functionName: "addVoter",
      args: [address as Address, BigInt(10)],
    });

    await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

    return Response.json({ success: true });
  } catch (err) {
    const errorMessage =
      (err as Error)?.message ?? "There was an error, please try again later";

    if (errorMessage.includes("ALREADY_ADDED")) {
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: errorMessage });
  }
}
