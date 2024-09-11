import { useState } from "react";
import { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProgramCreationModal from "@/components/ProgramCreationModal";
import { networks } from "@/lib/networks";

type AdminProps = { showProgramCreationModal: boolean };

const PROGRAMS_QUERY = gql`
  query ProgramsQuery($address: String, $chainId: Int) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: "program" }
      }
    ) {
      id
      metadata
      profileRolesByChainIdAndProfileId {
        address
        role
      }
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query } = ctx;

  return {
    props: {
      showProgramCreationModal: query.new ? true : false,
    },
  };
};

export default function Admin(props: AdminProps) {
  const [showProgramCreationModal, setShowProgramCreationModal] = useState(
    props.showProgramCreationModal,
  );
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: queryRes, loading } = useQuery(PROGRAMS_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId: connectedChain?.id,
    },
    skip: !address,
    pollInterval: 4000,
  });
  const router = useRouter();

  const network = networks.filter(
    (network) => network.id === connectedChain?.id,
  )[0];

  return (
    <>
      <Stack direction="vertical" gap={4} className="px-5 py-4">
        <Card.Text as="h1">Select or create an Allo Program</Card.Text>
        <Dropdown>
          <Dropdown.Toggle
            variant="transparent"
            className="d-flex justify-content-between align-items-center border border-2"
            style={{ width: 156 }}
          >
            {network?.name ?? networks[0].name}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {networks.map((network, i) => (
              <Dropdown.Item
                key={i}
                onClick={() =>
                  !connectedChain && openConnectModal
                    ? openConnectModal()
                    : switchChain({ chainId: network.id })
                }
              >
                {network.name}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        {loading ? (
          <Spinner className="m-auto" />
        ) : (
          <Stack direction="horizontal" gap={5} className="flex-wrap">
            {queryRes?.profiles.map(
              (
                profile: {
                  id: string;
                  metadata: { name: string };
                  profileRolesByChainIdAndProfileId: {
                    address: string;
                    role: "OWNER" | "MEMBER";
                  }[];
                },
                i: number,
              ) => (
                <Card
                  className="d-flex justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                  style={{ width: 256, height: 256 }}
                  onClick={() => {
                    router.push(
                      `/admin/pools/?chainid=${network?.id}&profileid=${profile.id}`,
                    );
                  }}
                  key={i}
                >
                  <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                    {profile.metadata.name}
                  </Card.Text>
                </Card>
              ),
            )}
            <Card
              className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
              style={{ width: 256, height: 256 }}
              onClick={
                !address
                  ? openConnectModal
                  : () => setShowProgramCreationModal(true)
              }
            >
              <Image src="/add.svg" alt="add" width={48} />
              <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                New Program
              </Card.Text>
            </Card>
          </Stack>
        )}
      </Stack>
      <ProgramCreationModal
        show={showProgramCreationModal}
        handleClose={() => setShowProgramCreationModal(false)}
        registryAddress={network?.alloRegistry ?? ""}
      />
    </>
  );
}
