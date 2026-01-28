import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";
import { supabaseClient } from "../db";
import { Tables } from "../types";
import { errorResponse } from "../../utils";

export const dynamic = "force-dynamic";

const PROGRAM_ID = 7762;
const DB_PAGE_SIZE = 1000;

export async function GET(req: NextRequest) {
  try {
    const chainId = req.nextUrl.searchParams.get("chainId") ?? 8453;
    const network = networks.find((network) => network.id === Number(chainId));

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    const now = (Date.now() / 1000) | 0;
    const stack = new StackClient({
      apiKey:
        network.id === 8453
          ? process.env.STACK_API_KEY_BEAMR!
          : process.env.STACK_API_KEY_OP_SEPOLIA!,
      pointSystemId: PROGRAM_ID,
    });
    const supabase = supabaseClient();

    let totalEventsProcessed = 0;
    let users: Tables<"users">[] = [];
    let offset = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from("users")
        .select("*")
        .range(offset, offset + DB_PAGE_SIZE - 1);

      if (!data || data.length === 0) {
        break;
      }

      users = users.concat(data);

      if (data.length < DB_PAGE_SIZE) {
        break;
      }

      offset += DB_PAGE_SIZE;
    }

    if (users.length > 0) {
      let allUserPoints: Tables<"user_points_total">[] = [];

      offset = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await supabase
          .from("user_points_total")
          .select("*")
          .range(offset, offset + DB_PAGE_SIZE - 1);

        if (!data || data.length === 0) {
          break;
        }

        allUserPoints = allUserPoints.concat(data);

        if (data.length < DB_PAGE_SIZE) {
          break;
        }

        offset += DB_PAGE_SIZE;
      }

      const pointsMap = new Map(
        allUserPoints?.map((up) => [up.fid, up.total_points]) ?? [],
      );

      const BATCH_SIZE = 250;
      const usersWithWallets = users.filter((x) => !!x.preferred_wallet);

      for (let i = 0; i < usersWithWallets.length; i += BATCH_SIZE) {
        const batch = usersWithWallets.slice(i, i + BATCH_SIZE);
        const batchEvents = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentPointsAll: any = await stack.getPoints(
          batch.map((x) => getAddress(x.preferred_wallet ?? "0x")),
          {
            event: "interacted-prelaunch",
          },
        );

        for (const user of batch) {
          const preferredWallet = user.preferred_wallet ?? "0x";
          const currentPoints =
            currentPointsAll?.find(
              (x: { address: string }) =>
                x.address.toLowerCase() === preferredWallet.toLowerCase(),
            )?.amount ?? 0;
          const newPoints = pointsMap.get(user.fid) ?? 0;
          const diff = newPoints - currentPoints;

          if (diff !== 0) {
            batchEvents.push({
              event: "interacted-prelaunch",
              payload: {
                points: diff,
                account: preferredWallet,
                uniqueId: `${preferredWallet}-${now}`,
              },
            });
          }
        }

        if (batchEvents.length > 0) {
          await stack.trackMany(batchEvents);

          totalEventsProcessed += batchEvents.length;
        }
      }
    }

    if (totalEventsProcessed > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Points updated",
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Nothing to update",
      }),
    );
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
