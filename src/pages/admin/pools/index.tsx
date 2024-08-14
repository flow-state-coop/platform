import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { useClampText } from "use-clamp-text";
import useAdminParams from "@/hooks/adminParams";
import { getApolloClient } from "@/lib/apollo";

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

export default function Pools() {
  const { profileId, updatePoolId, chainId } = useAdminParams();
  const { address } = useAccount();
  const { data: queryRes, loading } = useQuery(POOLS_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      chainId,
      profileId,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address || !profileId,
    pollInterval: 3000,
  });
  const router = useRouter();

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
          router.push("/admin/configure");
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
        <>Program not found, please select one from Program Selection</>
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
              router.push("/admin/configure");
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
