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

const PROGRAMS_QUERY = gql`
  query ProgramsQuery($address: String, $chainId: Int) {
    projects(
      filter: {
        chainId: { equalTo: $chainId }
        roles: { some: { address: { equalTo: $address } } }
        tags: { contains: "program" }
      }
    ) {
      metadata
    }
  }
`;

export default function Index() {
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { chains, switchChain } = useSwitchChain();
  const { data: programs, loading } = useQuery(PROGRAMS_QUERY, {
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId: connectedChain?.id ?? chains[0].id,
    },
    skip: !address,
    pollInterval: 10000,
  });
  const { data: hash, isPending, writeContract } = useWriteContract();
  const publicClient = usePublicClient();

  const createProgram = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    const profile = {
      name: "SQF",
      metadata: {
        protocol: BigInt(1),
        pointer: "bafkreiativdyic2h5xyirn3um6xbh4j6rhaqtxfdzjnjgcqwfxjnwbko6e",
      },
      members: [address],
    };

    const nonce = await publicClient.getTransactionCount({
      address,
    });
    const { name, metadata, members } = profile;

    writeContract({
      address: ALLO_REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: "createProfile",
      args: [BigInt(nonce), name, metadata, address, members],
    });
  };

  return (
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      <Card.Text as="h1">Select or create an Allo Program</Card.Text>
      <Dropdown>
        <Dropdown.Toggle
          variant="transparent"
          className="d-flex justify-content-between align-items-center w-20 border border-2"
        >
          {connectedChain?.name ?? chains[0].name}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {chains.map((chain, i) => (
            <Dropdown.Item
              key={i}
              onClick={() => switchChain({ chainId: chain.id })}
            >
              {chain.name}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
      {loading ? (
        <Spinner className="m-auto" />
      ) : (
        <Stack direction="horizontal" gap={5} className="flex-wrap">
          {programs?.projects.map(
            (project: { metadata: { name: string } }, i: number) => (
              <Card
                className="d-flex justify-content-center align-items-center border-2 rounded-4 fs-4"
                style={{ width: 256, height: 256 }}
                key={i}
              >
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  {project.metadata.name}
                </Card.Text>
              </Card>
            ),
          )}
          <Card
            className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
            style={{ width: 256, height: 256 }}
            onClick={!address ? openConnectModal : createProgram}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <>
                <Image src="/add.svg" alt="add" width={48} />
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  New Program
                </Card.Text>
              </>
            )}
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
