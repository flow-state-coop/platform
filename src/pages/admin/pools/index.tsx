import { useEffect } from "react";
import { useRouter } from "next/router";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { useAccount } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { useClampText } from "use-clamp-text";
import useAdminParams from "@/hooks/adminParams";
import { getApolloClient } from "@/lib/apollo";

type PoolsProps = {
  profileId: string | null;
  chainId: number | null;
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
      metadata
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query } = ctx;

  return {
    props: {
      profileId: query.profileid ?? null,
      chainId: Number(query.chainid) ?? null,
    },
  };
};

export default function Pools(props: PoolsProps) {
  const { profileId, chainId, updateProfileId, updatePoolId, updateChainId } =
    useAdminParams();
  const { address } = useAccount();
  const { data: queryRes, loading } = useQuery(POOLS_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      chainId,
      profileId,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address || !profileId,
    pollInterval: 4000,
  });
  const router = useRouter();

  useEffect(() => {
    if (!chainId || !profileId) {
      updateChainId(props.chainId);
      updateProfileId(props.profileId);
    }
  }, [props, chainId, profileId, updateChainId, updateProfileId, updatePoolId]);

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
          updatePoolId(pool.id);
          router.push(
            `/admin/configure/?chainid=${chainId}&profileid=${profileId}&poolid=${pool.id}`,
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
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      <Card.Text as="h1">Launch or Edit an SQF Pool</Card.Text>
      {loading ? (
        <Spinner className="m-auto" />
      ) : !profileId ? (
        <Card.Text>
          Program not found, please select one from{" "}
          <Link href="/admin" className="text-decoration-underline">
            Program Selection
          </Link>
        </Card.Text>
      ) : (
        <Stack direction="horizontal" gap={5} className="flex-wrap">
          {queryRes?.pools.map(
            (
              pool: {
                id: string;
                metadata: { name: string; description: string };
              },
              i: number,
            ) => <PoolCard pool={pool} key={i} />,
          )}
          <Card
            className="d-flex flex-column justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
            style={{ width: 256, height: 256 }}
            onClick={() => {
              updatePoolId(null);
              router.push(
                `/admin/configure/?chainid=${chainId}&profileid=${profileId}`,
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
  );
}
