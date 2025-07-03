import type { Metadata } from "next";
import type { SearchParams } from "@/types/searchParams";
import { gql, request } from "graphql-request";
import removeMarkdown from "remove-markdown";
import Project from "./project";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

type Profile = {
  profile: {
    metadataCid: string;
  };
};

export async function generateMetadata({
  params,
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const profileId = (await params).id;
    const chainId = (await searchParams).chainId;

    const endpoint = "https://api.flowstate.network/graphql";
    const query = gql`
      query Profile($profileId: String!, $chainId: Int!) {
        profile(id: $profileId, chainId: $chainId) {
          metadataCid
        }
      }
    `;
    const variables = {
      profileId,
      chainId: Number(chainId ?? DEFAULT_CHAIN_ID),
    };
    const res = await request<Profile>(endpoint, query, variables);
    const metadata = await fetchIpfsJson(res.profile.metadataCid);
    const images = [
      {
        url: `/api/og-image/?cid=${metadata.bannerImg}`,
        width: 1200,
        height: 630,
      },
    ];
    const description = removeMarkdown(metadata.description).replace(
      /\r?\n|\r/g,
      " ",
    );

    return {
      openGraph: {
        title: `${metadata.title} on Flow State`,
        description:
          description.length > 160
            ? `${description.slice(0, 160)}...`
            : description,
        images,
      },
      twitter: {
        card: "summary_large_image",
        title: `${metadata.title} on Flow State`,
        description:
          description.length > 160
            ? `${description.slice(0, 160)}...`
            : description,
        images,
      },
    };
  } catch (err) {
    console.log(err);
    return {};
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  searchParams: SearchParams;
  params: Promise<{ id: string }>;
}) {
  return (
    <Project
      chainId={searchParams.chainId ? Number(searchParams.chainId) : null}
      id={(await params).id ?? null}
    />
  );
}
