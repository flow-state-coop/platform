import type { Metadata } from "next";
import { isAddress } from "viem";
import FlowCouncil from "./flow-council";
import { db } from "@/app/api/flow-council/db";
import { networks } from "@/lib/networks";
import { OG_DEFAULT_IMAGE_URL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Params = {
  chainId: string;
  councilId: string;
};

const SITE_DEFAULT_TITLE = "Flow State - Streaming Funding Solutions";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  try {
    const { chainId, councilId } = await params;

    const network = networks.find((network) => network.id === Number(chainId));

    if (!network || !isAddress(councilId)) {
      return {};
    }

    const round = await db
      .selectFrom("rounds")
      .select("details")
      .where("chainId", "=", network.id)
      .where("flowCouncilAddress", "=", councilId.toLowerCase())
      .executeTakeFirst();

    if (!round) {
      return {};
    }

    const details =
      typeof round.details === "string"
        ? JSON.parse(round.details)
        : (round.details ?? {});

    const title =
      typeof details.name === "string" && details.name
        ? details.name
        : SITE_DEFAULT_TITLE;
    const shareImageUrl = details.social?.shareImageUrl;
    const images = [
      typeof shareImageUrl === "string" && shareImageUrl
        ? shareImageUrl
        : OG_DEFAULT_IMAGE_URL,
    ];

    return {
      title,
      openGraph: {
        title,
        url: `https://flowstate.network/flow-councils/${network.id}/${councilId}`,
        images,
      },
      twitter: {
        card: "summary_large_image",
        images,
      },
    };
  } catch (err) {
    console.error(err);
    return {};
  }
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, councilId } = await params;

  return <FlowCouncil chainId={Number(chainId)} councilId={councilId} />;
}
