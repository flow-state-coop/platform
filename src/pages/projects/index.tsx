import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAccount, useSwitchChain } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { usePostHog } from "posthog-js/react";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import ProjectCard from "@/components/ProjectCard";
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
  const { owner } = router.query;
  const { address, chain: connectedChain } = useAccount();
  const chainId = router.query.chainId
    ? Number(router.query.chainId)
    : connectedChain?.id;
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const postHog = usePostHog();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId: chainId ?? connectedChain?.id,
      address:
        !!owner && typeof owner === "string"
          ? owner.toLowerCase()
          : !!address && typeof address === "string"
            ? address.toLowerCase()
            : "",
    },
    skip: (!address && !owner) || !chainId,
    pollInterval: 3000,
  });

  const projects = queryRes?.profiles;
  const network = networks.filter((network) => network.id === chainId)[0];

  useEffect(() => {
    if (router.query.new) {
      setShowProjectCreationModal(true);
    }
  }, [router.query]);

  useEffect(
    () => postHog.stopSessionRecording(),
    [postHog, postHog.decideEndpointWasHit],
  );

  return (
    <Container
      className="mx-auto p-0 mb-5"
      style={{
        maxWidth:
          isMobile || isTablet
            ? "100%"
            : isSmallScreen
              ? 1000
              : isMediumScreen
                ? 1300
                : 1600,
      }}
    >
      <Stack direction="vertical" gap={4} className="p-4">
        {loading ? (
          <Spinner className="m-auto" />
        ) : (
          <>
            <Card.Text as="h1" className="m-0">
              Projects
            </Card.Text>
            <Card.Text className="fs-5">{owner ?? address}</Card.Text>
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
                    onClick={() => {
                      if (!connectedChain && openConnectModal) {
                        openConnectModal();
                      } else {
                        switchChain({ chainId: network.id });
                        router.replace(
                          `/projects/?chainId=${network.id}&owner=${owner ?? address}`,
                        );
                      }
                    }}
                  >
                    {network.name}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <div
              className="pb-5"
              style={{
                display: "grid",
                columnGap: "1.5rem",
                rowGap: "3rem",
                gridTemplateColumns: isTablet
                  ? "repeat(2,minmax(0,1fr))"
                  : isSmallScreen
                    ? "repeat(3,minmax(0,1fr))"
                    : isMediumScreen || isBigScreen
                      ? "repeat(4,minmax(0,1fr))"
                      : "",
              }}
            >
              {!owner ||
              owner.toString().toLowerCase() === address?.toLowerCase() ? (
                <Card
                  className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                  style={{ height: 418 }}
                  onClick={() => {
                    if (
                      (!!owner &&
                        !!address &&
                        owner.toString().toLowerCase() ===
                          address.toLowerCase()) ||
                      (!owner && !!address)
                    ) {
                      setShowProjectCreationModal(true);
                    } else if (openConnectModal) {
                      openConnectModal();
                    }
                  }}
                >
                  <Image src="/add.svg" alt="add" width={64} />
                  <Card.Text className="d-inline-block m-0 overflow-hidden fs-2 text-center word-wrap">
                    Create Project
                  </Card.Text>
                </Card>
              ) : null}
              {projects?.map((project: Project) => (
                <ProjectCard
                  key={project.id}
                  name={project.metadata.title}
                  description={project.metadata.description}
                  logoCid={project.metadata.logoImg}
                  bannerCid={project.metadata.bannerImg}
                  selectProject={() => {
                    router.push(`/projects/${project.id}/?chainId=${chainId}`);
                  }}
                  editProject={() =>
                    router.push(
                      `/projects/${project.id}/?chainId=${chainId}&edit=true`,
                    )
                  }
                  canEdit={
                    (!!owner &&
                      !!address &&
                      owner.toString().toLowerCase() ===
                        address.toLowerCase()) ||
                    (!owner && !!address)
                  }
                />
              ))}
            </div>
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
    </Container>
  );
}
