"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Sidebar from "../components/Sidebar";
import { useClampText } from "use-clamp-text";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "../lib/networks";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { getApolloClient } from "@/lib/apollo";

type PoolsProps = {
  profileId: string | null;
  chainId: number | null;
};

type Pool = {
  id: string;
  metadata: { name: string; description: string };
};

const POOLS_QUERY = gql`
  query PoolsQuery($chainId: Int, $profileId: String, $address: String) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        profileId: { equalTo: $profileId }
        poolRolesByChainIdAndPoolId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: "allo" }
      }
    ) {
      id
      metadataCid
    }
  }
`;

export default function Pools(props: PoolsProps) {
  const { chainId, profileId } = props;

  const [pools, setPools] = useState<Pool[] | null>(null);

  const router = useRouter();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: queryRes, loading } = useQuery(POOLS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      profileId,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address || !profileId,
    pollInterval: 4000,
  });

  const network = networks.filter((network) => network.id === chainId)[0];

  useEffect(() => {
    (async () => {
      if (!queryRes?.pools) {
        return;
      }

      const pools = [];

      for (const pool of queryRes.pools) {
        const metadata = await fetchIpfsJson(pool.metadataCid);

        if (metadata) {
          pools.push({ ...pool, metadata });
        }
      }

      setPools(pools);
    })();
  }, [queryRes?.pools]);

  const PoolCard = (props: {
    pool: {
      id: string;
      metadata: { name: string; description: string };
    };
  }) => {
    const { pool } = props;

    const [descriptionRef, { clampedText }] = useClampText({
      text: pool.metadata.description ?? "",
      ellipsis: "...",
      lines: 3,
    });

    return (
      <Card
        className="border-2 rounded-4 fs-4 cursor-pointer"
        style={{ width: 256, height: 256 }}
        onClick={() => {
          router.push(
            `/sqf/configure/?chainId=${chainId}&profileId=${profileId}&poolId=${pool.id}`,
          );
        }}
      >
        <Card.Body>
          <Card.Text
            className="w-100 overflow-hidden text-truncate text-center"
            style={{ marginTop: 75 }}
          >
            {pool.metadata.name ?? "N/A"}
          </Card.Text>
          <Card.Text
            ref={descriptionRef as React.RefObject<HTMLParagraphElement>}
            className="w-100 m-0 text-center fs-5"
          >
            {clampedText}
          </Card.Text>
        </Card.Body>
      </Card>
    );
  };

  return (
    <>
      <Sidebar />
      <Stack direction="vertical" className={!isMobile ? "w-75" : "w-100"}>
        <Stack direction="vertical" gap={4} className="px-5 py-4 mb-5">
          {!loading && chainId && profileId && (
            <Card.Text as="h1">Launch or Edit an SQF Pool</Card.Text>
          )}
          {!profileId || !chainId ? (
            <Card.Text>
              Program not found, please select one from{" "}
              <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : loading || !chainId || !profileId || pools === null ? (
            <Spinner className="m-auto" />
          ) : !connectedChain ? (
            <>Please connect a wallet</>
          ) : connectedChain?.id !== chainId ? (
            <Card.Text>
              Wrong network, please connect to{" "}
              <span
                className="p-0 text-decoration-underline cursor-pointer"
                onClick={() => switchChain({ chainId: network?.id ?? 10 })}
              >
                {network?.name}
              </span>{" "}
              or return to <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : (
            <Stack
              direction="horizontal"
              gap={5}
              className="flex-wrap justify-content-center justify-content-sm-start"
            >
              {pools.map((pool: Pool, i: number) => (
                <PoolCard pool={pool} key={i} />
              ))}
              <Card
                className="d-flex flex-column justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                style={{ width: 256, height: 256 }}
                onClick={() => {
                  router.push(
                    `/sqf/configure/?chainId=${chainId}&profileId=${profileId}`,
                  );
                }}
              >
                <Image src="/add.svg" alt="add" width={48} />
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  New Pool
                </Card.Text>
              </Card>
            </Stack>
          )}
        </Stack>
      </Stack>
    </>
  );
}
