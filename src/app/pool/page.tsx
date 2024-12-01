import type { Metadata, ResolvingMetadata } from "next";
import type { SearchParams } from "@/types/searchParams";
import { gql, request } from "graphql-request";
import removeMarkdown from "remove-markdown";
import Pool from "./pool";
import { DEFAULT_CHAIN_ID, DEFAULT_POOL_ID } from "@/lib/constants";

type Recipient = {
  id: string;
  metadata: { title: string; description: string; bannerImg: string };
};

type Pool = {
  pool: {
    metadata: { name: string; description: string };
    recipientsByPoolIdAndChainId: Recipient[];
  };
};

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<SearchParams> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  try {
    const poolId = (await searchParams).poolId;
    const chainId = (await searchParams).chainId;
    const recipientId = (await searchParams).recipientId;

    const endpoint = "https://api.flowstate.network/graphql";
    const query = gql`
      query Pool($poolId: String!, $chainId: Int!) {
        pool(id: $poolId, chainId: $chainId) {
          metadata
          recipientsByPoolIdAndChainId {
            id
            metadata
          }
        }
      }
    `;
    const variables = {
      poolId: poolId ?? DEFAULT_POOL_ID,
      chainId: Number(chainId ?? DEFAULT_CHAIN_ID),
    };
    const res = await request<Pool>(endpoint, query, variables);
    const previousImages = (await parent).openGraph?.images || [];
    const recipient = res.pool.recipientsByPoolIdAndChainId.find(
      (recipient) => recipient.id === recipientId,
    );
    const images =
      recipient && recipient.metadata.bannerImg
        ? [
            {
              url: `/api/og-image/?cid=${recipient.metadata.bannerImg}`,
              width: 1200,
              height: 630,
            },
          ]
        : [...previousImages];
    const description = removeMarkdown(
      recipient
        ? recipient.metadata.description
        : res.pool.metadata.description,
    ).replace(/\r?\n|\r/g, " ");

    return {
      openGraph: {
        title: recipient
          ? `Support ${recipient.metadata.title} in the ${res.pool.metadata.name} streaming funding round`
          : `${res.pool.metadata.name} on Flow State`,
        description:
          description.length > 160
            ? `${description.slice(0, 160)}...`
            : description,
        images,
      },
      twitter: {
        card: "summary_large_image",
        title: recipient
          ? `Support ${recipient.metadata.title} in the ${res.pool.metadata.name} streaming funding round`
          : `${res.pool.metadata.name} on Flow State`,
        description:
          description.length > 160
            ? `${description.slice(0, 160)}...`
            : description,
        images,
      },
    };
  } catch {
    return {};
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Pool
      chainId={
        searchParams.chainId ? Number(searchParams.chainId) : DEFAULT_CHAIN_ID
      }
      poolId={searchParams.poolId ?? DEFAULT_POOL_ID}
      recipientId={searchParams.recipientId ?? ""}
    />
  );
}
