import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Papa from "papaparse";
import { db } from "../db";
import { flowSplitter, chains, scoresCsvUrl } from "../constants";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { networks } from "@/lib/networks";
import { nextAuthOptions, truncateStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Score = { "Github Username": string; Score: number };

export async function POST(request: Request) {
  try {
    const { address, chainId } = await request.json();

    const session = await getServerSession(nextAuthOptions);
    const network = networks.find((network) => network.id === chainId);

    if (!session?.user?.name) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const res = await fetch(scoresCsvUrl[network.id]);
    const scoresCsv = await res.text();
    const scores = Papa.parse(scoresCsv, { header: true });
    const user = (scores.data as Score[]).find(
      (row: Score) => row["Github Username"] === session.user?.name,
    );

    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: "Not a contributor" }),
      );
    }

    const contributor = await db
      .selectFrom("contributors")
      .select("name")
      .select("address")
      .select("score")
      .where("chainId", "=", network.id)
      .where("name", "=", session.user.name)
      .executeTakeFirst();

    if (!contributor) {
      const publicClient = createPublicClient({
        chain: chains[network.id],
        transport: http(network.rpcUrl),
      });
      const walletClient = createWalletClient({
        chain: chains[network.id],
        transport: http(network.rpcUrl),
      });
      const account = privateKeyToAccount(
        process.env.GITHUB_REWARDS_PK as `0x${string}`,
      );

      const contractAddress = flowSplitter[network.id].address;
      const poolId = flowSplitter[network.id].poolId;

      if (!contractAddress) {
        return new Response(
          JSON.stringify({ success: false, error: "Contract not found" }),
        );
      }

      const hash = await walletClient.sendTransaction({
        account,
        to: contractAddress,
        data: encodeFunctionData({
          abi: flowSplitterAbi,
          functionName: "updateMembersUnits",
          args: [
            BigInt(poolId),
            [{ account: address, units: BigInt(user["Score"]) }],
          ],
        }),
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      await db
        .insertInto("contributors")
        .values({
          chainId: network.id,
          name: session.user?.name ?? "",
          address: address ?? "0x",
          score: Number(user["Score"]),
        })
        .execute();

      return new Response(
        JSON.stringify({
          success: true,
          message: `Units updated, transaction hash: ${hash}`,
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: `Already added as ${truncateStr(contributor.address, 14)}`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
