import {
  Address,
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

export const dynamic = "force-dynamic";

const SCORER_ID = 9864;

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

    const minScore = network.id === optimismSepolia.id ? 0.5 : 15;
    const passportStampRes = await fetch(
      `https://api.passport.xyz/v2/stamps/${SCORER_ID}/score/${address}`,
      {
        method: "GET",
        headers: { "X-API-KEY": process.env.PASSPORT_API_KEY! },
      },
    );
    const passportStamp = await passportStampRes.json();

    if (Number(passportStamp.score) < minScore) {
      const aggregateOnchainScoreRes = await fetch(
        `https://api.passport.xyz/v2/models/score/${address}`,
        {
          method: "GET",
          headers: { "X-API-KEY": process.env.PASSPORT_API_KEY! },
        },
      );
      const aggregateOnchainScore = await aggregateOnchainScoreRes.json();

      if (
        Number(aggregateOnchainScore.details.models.aggregate.score) < minScore
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Ineligible",
          }),
        );
      }
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
      process.env.FLOW_STATE_ELIGIBILITY_PK as `0x${string}`,
    );

    const balance = await publicClient.readContract({
      address: network.flowStateEligibilityNft as Address,
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
      to: network.flowStateEligibilityNft as Address,
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
    return new Response(
      JSON.stringify({
        success: false,
        error:
          (err as Error)?.message ??
          "There was an error, please try again later",
      }),
    );
  }
}
