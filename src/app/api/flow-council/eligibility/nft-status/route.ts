import { isAddress } from "viem";
import { networks } from "@/lib/networks";
import { findRoundByCouncil } from "../../auth";
import { loadNftRequirements } from "../../bot";
import { evaluateNftRequirements, toRequirements } from "../nftRequirements";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Read-only by construction: no insert, no update, no transaction, no rate
  // window. Opening the eligibility popup must never cost gas or change state.
  try {
    const { address, chainId, councilId } = await request.json();

    if (!address || !chainId || !councilId) {
      return Response.json({ success: false, error: "Invalid request" });
    }

    const numericChainId = Number(chainId);

    if (!Number.isInteger(numericChainId)) {
      return Response.json({ success: false, error: "Invalid chainId" });
    }

    if (!isAddress(address) || !isAddress(councilId)) {
      return Response.json({ success: false, error: "Invalid address" });
    }

    const network = networks.find((network) => network.id === numericChainId);

    if (!network) {
      return Response.json({ success: false, error: "Wrong network" });
    }

    const round = await findRoundByCouncil(numericChainId, councilId);

    if (!round) {
      return Response.json({ success: false, error: "Council not found" });
    }

    const requirements = toRequirements(await loadNftRequirements(round.id));

    const evaluation = await evaluateNftRequirements({
      network,
      councilId,
      address,
      requirements,
    });

    return Response.json({
      success: true,
      // A failed getVoter read flattens to "0" here, which can show an existing
      // voter the claim flow. Self-correcting: the claim route re-evaluates and
      // refuses with check_unavailable rather than granting anything. Kept as a
      // string so the response contract stays one type.
      votingPower: (evaluation.votingPower ?? 0n).toString(),
      botHasRole: evaluation.botHasRole,
      requirements: evaluation.rows,
    });
  } catch (err) {
    // RPC and contract errors can embed provider URLs and revert data, so they
    // are logged server-side only and never returned to the client.
    console.error(err);

    return Response.json(
      {
        success: false,
        error: "There was an error, please try again later",
      },
      { status: 500 },
    );
  }
}
