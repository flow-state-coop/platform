import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  pad,
  parseAbi,
  Address,
  Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { erc721Abi } from "@/lib/abi/erc721";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

const contractAddresses: {
  [id: number]: {
    eligibilityNft: Address;
    token: Address;
    pool: Address;
  };
} = {
  11155420: {
    eligibilityNft: "0x0B43772Df810575F87D4d9ff49403DF25168f993",
    token: "0x0043d7c85C8b96a49A72A92C0B48CdC4720437d7",
    pool: "0x1f6a8D0727303289AF7Bdd1a1FcbCA7C6A4585C5",
  },
  8453: {
    eligibilityNft: "0xAd424D55ffd23E80B222aA67138370A21c0a0b24",
    token: "0x46fd5cfb4c12d87acd3a13e92baa53240c661d93",
    pool: "0x8398c030be586c86759c4f1fc9f63df83c99813a",
  },
};

const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
};

const MINIMUM_FLOW_RATE = BigInt(380517503); // 0.001 per month

export async function POST(request: Request) {
  try {
    const { address, chainId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });

    const flowRate = await publicClient.readContract({
      address: network.gdaForwarder,
      abi: parseAbi([
        "function getFlowDistributionFlowRate(address token, address from, address to) view returns (int96)",
      ]),
      functionName: "getFlowDistributionFlowRate",
      args: [
        contractAddresses[network.id].token,
        address,
        contractAddresses[network.id].pool,
      ],
    });

    if (typeof flowRate !== "bigint" || flowRate < MINIMUM_FLOW_RATE) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Account doesn't have enough flow rate",
        }),
      );
    }

    const walletClient = createWalletClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const account = privateKeyToAccount(
      process.env.GUILD_NFT_PK as `0x${string}`,
    );

    const nftContractAddress = contractAddresses[network.id].eligibilityNft;

    if (!nftContractAddress) {
      return new Response(
        JSON.stringify({ success: false, error: "NFT contract not found" }),
      );
    }

    const balance = await publicClient.readContract({
      address: nftContractAddress,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [address],
    });

    if (balance > 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Already minted" }),
      );
    }

    const hash = await walletClient.sendTransaction({
      account,
      to: nftContractAddress,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: "airdropSequential",
        args: [[`${pad("0x1", { size: 12 })}${address.slice(2)}`], true],
      }),
    });

    await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

    return new Response(
      JSON.stringify({
        success: true,
        message: `NFT successfully minted, transaction hash: ${hash}`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
