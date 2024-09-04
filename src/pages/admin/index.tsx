import { useState } from "react";
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
import useAdminParams from "@/hooks/adminParams";
import { networks } from "@/lib/networks";

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

export default function Index() {
  const [showProgramCreationModal, setShowProgramCreationModal] =
    useState(false);
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const {
    updateProfileId,
    updateProfileOwner,
    updateProfileMembers,
    updateChainId,
  } = useAdminParams();
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
                    updateProfileId(profile.id);
                    updateProfileOwner(
                      profile.profileRolesByChainIdAndProfileId.find(
                        (p) => p.role === "OWNER",
                      )?.address ?? null,
                    );
                    const members =
                      profile.profileRolesByChainIdAndProfileId.filter(
                        (profileRole) => profileRole.role === "MEMBER",
                      );
                    updateProfileMembers(
                      members.map((profileRole) => profileRole.address),
                    );
                    updateChainId(network?.id);
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
