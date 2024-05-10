import { useRouter } from "next/router";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { registryAbi } from "@/lib/abi/registry";
import { ALLO_REGISTRY_ADDRESS } from "@/lib/constants";

const POOLS_QUERY = gql`
  query PoolsQuery($address: String, $chainId: Int) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
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
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { chains, switchChain } = useSwitchChain();
  const { data: queryRes, loading } = useQuery(POOLS_QUERY, {
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId: connectedChain?.id ?? chains[0].id,
    },
    skip: !address,
    pollInterval: 10000,
  });
  const { data: hash, isPending, writeContract } = useWriteContract();
  const router = useRouter();
  const publicClient = usePublicClient();

  return (
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      <Card.Text as="h1">Launch or Edit an SQF Pool</Card.Text>
      {loading ? (
        <Spinner className="m-auto" />
      ) : (
        <Stack direction="horizontal" gap={5} className="flex-wrap">
          {queryRes?.pools.map(
            (pool: { id: string; metadata: { name: string } }, i: number) => (
              <Card
                className="d-flex justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                style={{ width: 256, height: 256 }}
                onClick={() => router.push(`/configure/?id=${pool.id}`)}
                key={i}
              >
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  {pool.metadata.name}
                </Card.Text>
              </Card>
            )
          )}
          <Card
            className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
            style={{ width: 256, height: 256 }}
            onClick={() => router.push("/configure")}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <>
                <Image src="/add.svg" alt="add" width={48} />
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  New Pool
                </Card.Text>
              </>
            )}
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
