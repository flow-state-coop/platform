import { NextRequest } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Papa from "papaparse";
import { db } from "../db";
import { chains, flowSplitter, scoresCsvUrl } from "../constants";
import { flowSplitterAbi } from "@/lib/abi/flowSplitter";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

type Score = { "Github Username": string; Score: string };

export async function GET(request: NextRequest) {
  try {
    const chainId = request.nextUrl.searchParams.get("chainId");
    const network = networks.find((network) => network.id === Number(chainId));

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const membersToUpdate: { account: Address; units: bigint }[] = [];
    const res = await fetch(scoresCsvUrl[network.id]);
    const scoresCsv = await res.text();
    const scores = Papa.parse(scoresCsv, { header: true });
    const registeredContributors = await db
      .selectFrom("contributors")
      .select("name")
      .select("address")
      .select("score")
      .where("chainId", "=", network.id)
      .execute();

    for (const row of scores.data as Score[]) {
      const username = row["Github Username"];
      const registeredContributor = registeredContributors.find(
        (contributor) => contributor.name === username,
      );

      if (registeredContributor) {
        const userScore = Number(row["Score"]);

        if (userScore !== registeredContributor.score) {
          membersToUpdate.push({
            account: registeredContributor.address as Address,
            units: BigInt(userScore),
          });
        }
      }
    }

    if (membersToUpdate.length > 0) {
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
          args: [BigInt(poolId), membersToUpdate],
        }),
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      await db.transaction().execute(async (trx) => {
        for (const member of membersToUpdate) {
          await trx
            .updateTable("contributors")
            .set({
              score: Number(member.units),
            })
            .where("address", "=", member.account)
            .executeTakeFirstOrThrow();
        }

        return trx;
      });

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
        message: `Nothing to update`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
