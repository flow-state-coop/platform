import type { Metadata, ResolvingMetadata } from "next";
import dynamic from "next/dynamic";

import type { SearchParams } from "@/types/searchParams";
import { gql, request } from "graphql-request";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import removeMarkdown from "remove-markdown";
import { DEFAULT_CHAIN_ID, DEFAULT_POOL_ID } from "@/lib/constants";

const Pool = dynamic(() => import("./pool"), { ssr: false });

type Recipient = {
  id: string;
  metadataCid: string;
};

type Pool = {
  pool: {
    metadataCid: string;
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
          metadataCid
          recipientsByPoolIdAndChainId {
            id
            metadataCid
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
    const recipientMetadata = await fetchIpfsJson(recipient?.metadataCid ?? "");
    const poolMetadata = await fetchIpfsJson(res.pool.metadataCid);
    const images =
      recipientMetadata && recipientMetadata.bannerImg
        ? [
            {
              url: `/api/og-image/?cid=${recipientMetadata.bannerImg}`,
              width: 1200,
              height: 630,
            },
          ]
        : [...previousImages];
    const description = removeMarkdown(
      recipient ? recipientMetadata.description : poolMetadata.description,
    ).replace(/\r?\n|\r/g, " ");

    return {
      openGraph: {
        title: recipient
          ? `Support ${recipientMetadata.title} in the ${poolMetadata.name} streaming funding round`
          : `${poolMetadata.name} on Flow State`,
        description:
          description.length > 160
            ? `${description.slice(0, 160)}...`
            : description,
        images,
      },
      twitter: {
        card: "summary_large_image",
        title: recipient
          ? `Support ${recipientMetadata.title} in the ${poolMetadata.name} streaming funding round`
          : `${poolMetadata.name} on Flow State`,
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
      editPoolDistribution={searchParams.editPoolDistribution ? true : false}
    />
  );
}
