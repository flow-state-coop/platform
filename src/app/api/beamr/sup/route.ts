import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";
import { supabaseClient } from "../db";

export const dynamic = "force-dynamic";

const PROGRAM_ID = 7762;

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
    const { data: users } = await supabase.from("users").select("*");
    const events = [];

    if (users) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentPointsAll: any = await stack.getPoints(
        users.map((x) => getAddress(x.preferred_wallet ?? "0x")),
        {
          event: "interacted-prelaunch",
        },
      );

      for (const user of users) {
        const preferredWallet = user.preferred_wallet ?? "0x";
        const currentPoints =
          currentPointsAll?.find(
            (x: { address: string }) =>
              x.address.toLowerCase() === preferredWallet,
          )?.amount ?? 0;
        const { data: userPointsTotal } = await supabase
          .from("user_points_total")
          .select("*")
          .eq("fid", user.fid);
        const newPoints = userPointsTotal?.[0].total_points ?? 0;
        const diff = newPoints - currentPoints;

        if (diff !== 0) {
          events.push({
            event: "interacted-prelaunch",
            payload: {
              points: diff,
              account: preferredWallet,
              uniqueId: `${preferredWallet}-${now}`,
            },
          });
        }
      }
    }

    if (events.length > 0) {
      await stack.trackMany(events);

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

    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
