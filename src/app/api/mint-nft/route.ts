import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  pad,
  Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimism, arbitrum, base, optimismSepolia } from "wagmi/chains";
import { erc721Abi } from "@/lib/abi/erc721";
import { networks } from "@/lib/networks";
import { errorResponse } from "../utils";

export const dynamic = "force-dynamic";

const NftContractAddresses: { [id: number]: `0x${string}` } = {
  11155420: "0x0B43772Df810575F87D4d9ff49403DF25168f993",
  8453: "0xAd424D55ffd23E80B222aA67138370A21c0a0b24",
};

const chains: { [id: number]: Chain } = {
  10: optimism,
  42161: arbitrum,
  8453: base,
  11155420: optimismSepolia,
};

export async function POST(request: Request) {
  try {
    const { address, chainId } = await request.json();

    const network = networks.find((network) => network.id === chainId);

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const walletClient = createWalletClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });
    const account = privateKeyToAccount(
      process.env.GUILD_NFT_PK as `0x${string}`,
    );

    const nftContractAddress = NftContractAddresses[network.id];

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
    return errorResponse(err);
  }
}
