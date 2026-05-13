import { getServerSession } from "next-auth/next";
import { createPublicClient, http, parseAbi, Address, isAddress } from "viem";
import { celo } from "viem/chains";
import { db } from "../db";
import { authOptions } from "../../auth/[...nextauth]/route";
import { networks } from "@/lib/networks";
import { ApplicationStatus } from "@/generated/kysely";
import {
  sendApplicationStatusChangedEmail,
  resolveProjectManagerRecipients,
  resolveProjectManagerAddresses,
  getProjectAndRoundDetails,
} from "../email";
import { writeInboxItems } from "@/lib/inboxWriter";
import { errorResponse } from "../../utils";
import { RECIPIENT_MANAGER_ROLE } from "@/app/flow-councils/lib/constants";
import { findRoundByCouncil } from "../auth";

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
      chain: celo,
      transport: http(network.rpcUrl),
    });

    const hasRole = await publicClient.readContract({
      address: councilId as Address,
      abi: parseAbi([
        "function hasRole(bytes32 role, address account) view returns (bool)",
      ]),
      functionName: "hasRole",
      args: [RECIPIENT_MANAGER_ROLE, session.address as Address],
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized" }),
      );
    }

    const round = await findRoundByCouncil(chainId, councilId);

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
      resolveProjectManagerRecipients(
        application.projectId,
        "application_eligibility",
        session.address,
      ),
      resolveProjectManagerAddresses(application.projectId, session.address),
      getProjectAndRoundDetails(application.projectId, round.id),
    ])
      .then(([recipients, inboxAddresses, details]) => {
        const tasks: Promise<unknown>[] = [];
        if (recipients.length > 0 && details) {
          tasks.push(
            sendApplicationStatusChangedEmail(recipients, {
              baseUrl,
              projectName: details.projectName,
              roundName: details.roundName,
              status: newStatus,
              chainId: details.chainId,
              councilId: details.councilId,
              projectId: application.projectId,
            }),
          );
        }
        if (inboxAddresses.length > 0) {
          tasks.push(
            writeInboxItems(
              inboxAddresses.map((address) => ({
                recipientAddress: address,
                category: "application_eligibility",
                sourceLabel: details?.roundName ?? null,
                snippet: `Status: ${newStatus}`,
                applicationId: application.id,
              })),
            ),
          );
        }
        return Promise.all(tasks);
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
