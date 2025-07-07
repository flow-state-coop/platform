import { celo } from "viem/chains";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    const res = await fetch(
      "https://goodserver.gooddollar.org/verify/topwallet",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: address,
          chainId: celo.id,
        }),
      },
    );
    const data = await res.json();

    if (data) {
      return new Response(
        JSON.stringify({
          success: true,
          message: data,
        }),
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: `Failed request with status ${res.status}`,
      }),
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err }));
  }
}
