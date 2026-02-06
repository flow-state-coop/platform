import { getServerSession } from "next-auth/next";
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  parseAbi,
  Address,
  isAddress,
} from "viem";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { ApplicationStatus } from "@/generated/kysely";
import { chains } from "@/app/flow-councils/lib/constants";
import {
  sendApplicationStatusChangedEmail,
  getProjectEmails,
  getProjectAndRoundDetails,
} from "../email";
import { errorResponse } from "../../utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chainId, councilId } = body;

    const session = await getServerSession(authOptions);
    const network = networks.find((network) => network.id === chainId);

    if (!session?.address) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthenticated" }),
      );
    }

    if (!network) {
      return new Response(
        JSON.stringify({ success: false, error: "Wrong network" }),
      );
    }

    if (!councilId || !isAddress(councilId)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid council ID" }),
      );
    }

    const publicClient = createPublicClient({
      chain: chains[network.id],
      transport: http(network.rpcUrl),
    });

    const recipientManagerRole = keccak256(
      encodePacked(["string"], ["RECIPIENT_MANAGER_ROLE"]),
    );

    const hasRole = await publicClient.readContract({
      address: councilId as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [recipientManagerRole, session.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    const round = await db
      .selectFrom("rounds")
      .select("id")
      .where("chainId", "=", chainId)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return new Response(
        JSON.stringify({ success: false, error: "Round not found" }),
      );
    }

    const { applicationId, newStatus, comment } = body;

    if (!applicationId || typeof applicationId !== "number") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid application ID" }),
      );
    }

    if (!newStatus || typeof newStatus !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid status" }),
      );
    }

    // Get the application to get project ID
    const application = await db
      .selectFrom("applications")
      .select(["id", "projectId"])
      .where("id", "=", applicationId)
      .where("roundId", "=", round.id)
      .executeTakeFirst();

    if (!application) {
      return new Response(
        JSON.stringify({ success: false, error: "Application not found" }),
      );
    }

    // Update application status
    await db
      .updateTable("applications")
      .set({
        status: newStatus as ApplicationStatus,
        updatedAt: new Date(),
      })
      .where("id", "=", applicationId)
      .where("roundId", "=", round.id)
      .execute();

    // Create automated message in project chat
    const messageContent = `New Application Status: ${newStatus}${comment ? `. Comments: ${comment}` : ""}`;

    await db
      .insertInto("messages")
      .values({
        channelType: "GROUP_PROJECT",
        roundId: round.id,
        projectId: application.projectId,
        applicationId: applicationId,
        authorAddress: session.address.toLowerCase(),
        content: messageContent,
      })
      .execute();

    // Send email notification to project managers (non-blocking)
    // Exclude the admin who made the status change
    const baseUrl = new URL(request.url).origin;
    Promise.all([
      getProjectEmails(application.projectId, session.address),
      getProjectAndRoundDetails(application.projectId, round.id),
    ])
      .then(([projectEmails, details]) => {
        if (projectEmails.length > 0 && details) {
          return sendApplicationStatusChangedEmail(projectEmails, {
            baseUrl,
            projectName: details.projectName,
            roundName: details.roundName,
            status: newStatus,
            chainId: details.chainId,
            councilId: details.councilId,
            projectId: application.projectId,
          });
        }
      })
      .catch((err) =>
        console.error("Failed to send status change email:", err),
      );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Application updated successfully",
      }),
    );
  } catch (err) {
    console.error(err);

    return errorResponse(err);
  }
}
