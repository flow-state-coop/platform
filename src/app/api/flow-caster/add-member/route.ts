import {
  Address,
  isAddress,
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Chain, base, optimismSepolia } from "wagmi/chains";
import { networks } from "@/lib/networks";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";

export const dynamic = "force-dynamic";

const flowSplitters: { [id: number]: { id: number; address: Address } } = {
  8453: {
    id: 32,
    address: "0x25B64C200cf3362BaC6961353D38A1dbEB42e60E",
  },
  11155420: {
    id: 71,
    address: "0xd53B8Bed28E122eA20dCC90d3991a614EC163a21",
  },
};
const chains: { [id: number]: Chain } = {
  8453: base,
  11155420: optimismSepolia,
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.FLOW_CASTER_SUP_ACCESS_TOKEN}`) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401 },
      );
    }

    const { chainId, member } = await req.json();

    const network = networks.find(
      (network) => network.id === Number(chainId ?? 8453),
    );

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
        { status: 401 },
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const walletClient = createWalletClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const account = privateKeyToAccount(
      process.env.FLOW_STATE_ELIGIBILITY_PK as `0x${string}`,
    );
    const flowSplitter = flowSplitters[network.id];

    if (!isAddress(member)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid address" }),
        { status: 400 },
      );
    }

    const hash = await walletClient.writeContract({
      account,
      abi: flowSplitterAbi,
      address: flowSplitter.address as Address,
      functionName: "updateMembersUnits",
      args: [BigInt(flowSplitter.id), [{ account: member, units: BigInt(1) }]],
    });

    await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Member added",
      }),
    );
  } catch (err) {
    console.error(err);

    if (err instanceof Error) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 400 },
      );
    } else {
      return new Response(
        JSON.stringify({ success: false, error: "Unkown Error" }),
        { status: 400 },
      );
    }
  }
}
