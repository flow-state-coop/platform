import { z } from "zod";
import { gql } from "@apollo/client";
import { isAddress } from "viem";
import { db } from "../db";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { errorResponse } from "../../utils";
import { findRoundByCouncil } from "../auth";
import { ProjectDetails } from "@/types/project";

export const dynamic = "force-dynamic";

const queryParamsSchema = z.object({
  chainId: z.coerce
    .number()
    .refine((id) => networks.some((n) => n.id === id), "Wrong network"),
  councilId: z.string().refine(isAddress, "Invalid council ID"),
});

const SUBGRAPH_RECIPIENTS_QUERY = gql`
  query FlowCouncilRecipients($councilId: String!, $skip: Int!) {
    flowCouncil(id: $councilId) {
      id
      recipients(first: 1000, skip: $skip, where: { removed: false }) {
        account
      }
    }
  }
`;

const PAGE_SIZE = 1000;

// Hard cap on subgraph pages so a buggy endpoint that always returns a full
// page can't spin forever. 100 pages = 100k recipients, far beyond any council.
const MAX_PAGES = 100;

type SubgraphRecipient = { account: string };

async function fetchRecipientAddresses(
  chainId: number,
  councilId: string,
): Promise<string[]> {
  const client = getApolloClient("flowCouncil", chainId);
  const accounts: string[] = [];
  let skip = 0;
  let page = 0;

  for (; page < MAX_PAGES; page++) {
    const { data } = await client.query({
      query: SUBGRAPH_RECIPIENTS_QUERY,
      variables: { councilId: councilId.toLowerCase(), skip },
      fetchPolicy: "no-cache",
    });

    const recipients: SubgraphRecipient[] = data?.flowCouncil?.recipients ?? [];

    for (const recipient of recipients) {
      accounts.push(recipient.account.toLowerCase());
    }

    if (recipients.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  if (page === MAX_PAGES) {
    console.warn(
      `fetchRecipientAddresses: hit MAX_PAGES (${MAX_PAGES}) for council ` +
        `${councilId}; recipient list may be truncated`,
    );
  }

  return accounts;
}

/**
 * Public, unauthenticated list of a council's current on-chain recipients. The
 * authoritative set comes from the subgraph (removed recipients excluded);
 * names are a best-effort join against accepted/graduated applications, so a
 * recipient added on-chain without a matching application has a null name. This
 * is the recipient list a metrics integration votes on, exposed so callers
 * don't have to query the subgraph directly.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = queryParamsSchema.safeParse({
      chainId: searchParams.get("chainId"),
      councilId: searchParams.get("councilId"),
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return new Response(
        JSON.stringify({ success: false, error: issue.message }),
      );
    }

    const { chainId, councilId } = parsed.data;

    const addresses = await fetchRecipientAddresses(chainId, councilId);

    if (addresses.length === 0) {
      return new Response(JSON.stringify({ success: true, recipients: [] }));
    }

    const round = await findRoundByCouncil(chainId, councilId);

    const nameByAddress = new Map<string, string>();

    if (round) {
      const applications = await db
        .selectFrom("applications")
        .innerJoin("projects", "applications.projectId", "projects.id")
        .select(["applications.fundingAddress", "projects.details as details"])
        .where("applications.roundId", "=", round.id)
        .where("applications.status", "in", ["ACCEPTED", "GRADUATED"])
        .execute();

      for (const app of applications) {
        const details = (
          typeof app.details === "string"
            ? JSON.parse(app.details)
            : app.details
        ) as ProjectDetails | null;

        if (details?.name) {
          nameByAddress.set(app.fundingAddress.toLowerCase(), details.name);
        }
      }
    }

    const recipients = addresses.map((address) => ({
      address,
      name: nameByAddress.get(address) ?? null,
    }));

    return new Response(JSON.stringify({ success: true, recipients }));
  } catch (err) {
    console.error(err);
    return errorResponse(err);
  }
}
