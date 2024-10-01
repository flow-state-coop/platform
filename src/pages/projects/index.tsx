import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAccount, useSwitchChain } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Project } from "@/types/project";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: ["allo", "project"] }
      }
    ) {
      id
      anchorAddress
      metadataCid
      metadata
      profileRolesByChainIdAndProfileId {
        address
      }
    }
  }
`;

export default function Projects() {
  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);

  const router = useRouter();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { isMobile } = useMediaQuery();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      chainId: connectedChain?.id,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address,
    pollInterval: 3000,
  });

  const projects = queryRes?.profiles;
  const network = networks.filter(
    (network) => network.id === connectedChain?.id,
  )[0];

  useEffect(() => {
    if (router.query.new) {
      setShowProjectCreationModal(true);
    }
  }, [router.query]);

  return (
    <>
      <Stack direction="vertical" gap={4} className="p-4">
        {loading ? (
          <Spinner className="m-auto" />
        ) : (
          <>
            <Card.Text as="h1" className="m-0">
              Projects
            </Card.Text>
            <Card.Text className="fs-5">{address}</Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                variant="transparent"
                className={`d-flex justify-content-between align-items-center border border-2 ${isMobile ? "" : "w-20"}`}
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
            <Stack direction="horizontal" gap={5} className="flex-wrap">
              <Card
                className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                style={{ width: isMobile ? "100%" : 256, height: 256 }}
                onClick={() => {
                  if (address) {
                    setShowProjectCreationModal(true);
                  } else if (openConnectModal) {
                    openConnectModal();
                  }
                }}
              >
                <Image src="/add.svg" alt="add" width={48} />
                <Card.Text className="d-inline-block m-0 overflow-hidden text-center word-wrap">
                  Create Project
                </Card.Text>
              </Card>
              {projects?.map((project: Project, i: number) => (
                <Card
                  className={`d-flex justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer`}
                  style={{
                    width: isMobile ? "100%" : 256,
                    height: 256,
                  }}
                  onClick={() =>
                    router.push(
                      `/projects/${project.id}/?chainId=${network?.id}`,
                    )
                  }
                  key={i}
                >
                  <>
                    <Card.Body className="d-flex flex-column w-100 h-75 justify-content-end">
                      <Card.Text className="d-inline-block w-100 m-0 text-center overflow-hidden word-wrap">
                        {project.metadata.title}
                      </Card.Text>
                    </Card.Body>
                    <Card.Footer className="position-relative d-flex align-items-bottom justify-content-center w-100 h-50 border-0 bg-transparent pt-0">
                      <Button
                        variant="transparent"
                        className="position-absolute bottom-0 end-0 p-3 border-0"
                        onClick={() => {
                          router.push(
                            `/projects/${project.id}/?chainId=${network?.id}&edit=true`,
                          );
                        }}
                      >
                        <Image src="/edit.svg" alt="edit" width={24} />
                      </Button>
                    </Card.Footer>
                  </>
                </Card>
              ))}
            </Stack>
          </>
        )}
      </Stack>
      {network && (
        <ProjectCreationModal
          show={showProjectCreationModal}
          handleClose={() => setShowProjectCreationModal(false)}
          registryAddress={network.alloRegistry}
          setNewProfileId={() => null}
        />
      )}
    </>
  );
}
