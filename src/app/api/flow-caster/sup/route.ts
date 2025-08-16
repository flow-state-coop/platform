import { StackClient } from "@stackso/js-core";
import { networks } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.FLOW_CASTER_SUP_ACCESS_TOKEN}`) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401 },
      );
    }

    const { chainId, event, account, points } = await req.json();

    const network = networks.find(
      (network) => network.id === Number(chainId ?? 8453),
    );

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
        { status: 401 },
      );
    }

    const now = (Date.now() / 1000) | 0;
    const stack = new StackClient({
      apiKey:
        network.id === 8453
          ? process.env.STACK_API_KEY_FLOW_CASTER!
          : process.env.STACK_API_KEY_OP_SEPOLIA!,
      pointSystemId: network.id === 8453 ? 7743 : 7717,
    });

    await stack.track(event, {
      points,
      account,
      uniqueId: `${account}-${now}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Points updated",
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
