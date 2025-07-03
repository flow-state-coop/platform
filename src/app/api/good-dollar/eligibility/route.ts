import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  Address,
  Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, optimismSepolia } from "wagmi/chains";
import { councilAbi } from "@/lib/abi/council";
import { networks } from "@/lib/networks";
import { councilConfig } from "@/app/gooddollar/lib/councilConfig";

export const dynamic = "force-dynamic";

const GOOD_DOLLAR = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42";

const chains: { [id: number]: Chain } = {
  42220: celo,
  11155420: optimismSepolia,
};

export async function POST(request: Request) {
  try {
    const { address, chainId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network || !chains[network.id]) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const isWhitelisted = await createPublicClient({
      chain: chains[celo.id],
      transport: http(
        networks.find((network) => network.id === celo.id)!.rpcUrl,
      ),
    }).readContract({
      address: GOOD_DOLLAR,
      abi: parseAbi([
        "function isWhitelisted(address account) public view returns (bool)",
      ]),
      functionName: "isWhitelisted",
      args: [address],
    });

    if (!isWhitelisted) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Account is not whitelisted",
        }),
      );
    }

    const councilAddress = councilConfig[network.id].councilAddress;

    if (!councilAddress) {
      return new Response(
        JSON.stringify({ success: false, error: "Council contract not found" }),
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });

    const votingPower = await publicClient.readContract({
      address: councilAddress as Address,
      abi: councilAbi,
      functionName: "balanceOf",
      args: [address],
    });

    if (votingPower > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Initial votes already assigned",
        }),
      );
    }

    const walletClient = createWalletClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const account = privateKeyToAccount(
      process.env.FLOW_STATE_ELIGIBILITY_PK as `0x${string}`,
    );

    const hash = await walletClient.writeContract({
      account,
      abi: councilAbi,
      address: councilAddress as Address,
      functionName: "addCouncilMember",
      args: [address, BigInt(10)],
    });

    await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Initial votes successfully assigned, transaction hash: ${hash}`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
