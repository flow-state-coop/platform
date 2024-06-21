import { useState, useEffect } from "react";
import { GetServerSideProps } from "next";
import { Address, encodeAbiParameters, parseAbiParameters } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import ProjectUpdateModal from "@/components/ProjectUpdateModal";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Project } from "@/types/project";
import { networks } from "@/lib/networks";
import { alloAbi } from "@/lib/abi/allo";
import { getApolloClient } from "@/lib/apollo";
import { strategyAbi } from "@/lib/abi/strategy";

type GranteeProps = {
  poolId: string;
  chainId: string;
};

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!, $poolId: String!) {
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
    pool(chainId: $chainId, id: $poolId) {
      strategyAddress
      metadata
      matchingToken
      allocationToken
      recipientsByPoolIdAndChainId(
        filter: { recipientAddress: { equalTo: $address } }
      ) {
        id
        status
        anchorAddress
        recipientAddress
      }
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query } = ctx;

  return {
    props: { poolId: query.poolid ?? null, chainId: query.chainid ?? null },
  };
};

export default function Grantee(props: GranteeProps) {
  const { poolId, chainId } = props;

  const [selectedProjectIndex, setSelectedProjectIndex] = useState<
    number | null
  >(null);
  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);
  const [showProjectUpdateModal, setShowProjectUpdateModal] = useState(false);
  const [newProfileId, setNewProfileId] = useState("");

  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      chainId: Number(chainId),
      address: address?.toLowerCase() ?? "",
      poolId,
    },
    skip: !address || !poolId,
    pollInterval: 3000,
  });
  const { isPending, writeContractAsync } = useWriteContract();
  const { data: minPassportScore } = useReadContract({
    address: queryRes?.pool.strategyAddress as Address,
    abi: strategyAbi,
    functionName: "minPassportScore",
  });
  const publicClient = usePublicClient();

  const network = networks.filter(
    (network) => network.id === Number(chainId),
  )[0];
  const pool = queryRes?.pool ?? null;
  const recipients = pool?.recipientsByPoolIdAndChainId ?? null;
  const projects =
    queryRes?.profiles.map((profile: Project) => {
      let recipientStatus = null;

      for (const recipient of recipients) {
        if (
          recipient.anchorAddress === profile.anchorAddress ||
          recipient.id === address?.toLowerCase()
        ) {
          recipientStatus = recipient.status;
        }
      }

      return { ...profile, status: recipientStatus };
    }) ?? null;

  useEffect(() => {
    if (!newProfileId) {
      return;
    }

    const projectIndex = projects
      .map((project: Project) => project.id)
      .indexOf(newProfileId);

    if (projectIndex > -1) {
      setSelectedProjectIndex(projectIndex);
      setNewProfileId("");
    }
  }, [newProfileId, projects]);

  const registerRecipient = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    if (selectedProjectIndex === null) {
      throw Error("Invalid profile");
    }

    const project = projects[selectedProjectIndex];
    const recipientData: `0x${string}` = encodeAbiParameters(
      parseAbiParameters("address, address, (uint256, string)"),
      [project.anchorAddress, address, [BigInt(1), project.metadataCid]],
    );

    try {
      await writeContractAsync({
        address: network.allo,
        abi: alloAbi,
        functionName: "registerRecipient",
        args: [BigInt(poolId!), recipientData],
      });

      setSelectedProjectIndex(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <Stack direction="vertical" gap={4} className="px-5 py-4">
        {!network ? (
          <>Network not supported</>
        ) : !poolId || (queryRes && queryRes.pool === null) ? (
          <>Pool not found</>
        ) : !connectedChain?.id || !address ? (
          <>Please connect a wallet</>
        ) : (
          <>
            <Card className="border-0">
              <Card.Text as="h1" className="mb-3">
                Select or create a project to apply to the pool
              </Card.Text>
              <Card.Text as="h2" className="fs-3">
                {pool?.metadata.name}
              </Card.Text>
              <Card.Text
                className="overflow-hidden word-wrap"
                style={{ maxHeight: "2lh" }}
              >
                {pool?.metadata.description}
              </Card.Text>
            </Card>
            <Dropdown>
              <Dropdown.Toggle
                variant="transparent"
                className={`d-flex justify-content-between align-items-center border border-2 ${isMobile ? "" : "w-20"}`}
                disabled
              >
                {network.name}
              </Dropdown.Toggle>
            </Dropdown>
            <Card className="border-0">
              <Card.Text className="m-0">
                - Donation Token:{" "}
                {network.tokens.find(
                  (token) =>
                    token.address.toLowerCase() ===
                    pool?.allocationToken?.toLowerCase(),
                )?.name ?? "N/A"}
              </Card.Text>
              <Card.Text className="m-0">
                - Matching Token:{" "}
                {network.tokens.find(
                  (token) =>
                    token.address.toLowerCase() === pool?.matchingToken,
                )?.name ?? "N/A"}
              </Card.Text>
              <Card.Text>
                - Gitcoin Passport Threshold:{" "}
                {minPassportScore
                  ? parseFloat((Number(minPassportScore) / 10000).toFixed(2))
                  : "N/A"}
              </Card.Text>
            </Card>
            {loading ? (
              <Spinner className="m-auto" />
            ) : (
              <Stack direction="horizontal" gap={5} className="flex-wrap">
                {projects?.map(
                  (project: Project & { status: Status | null }, i: number) => (
                    <Card
                      className={`d-flex justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer ${
                        selectedProjectIndex === i
                          ? "border-5 border-primary"
                          : project.status === "APPROVED"
                            ? "border-5 border-success"
                            : project.status === "REJECTED"
                              ? "border-5 border-danger"
                              : project.status === "PENDING"
                                ? "border-5 border-warning"
                                : ""
                      }
                    `}
                      style={{
                        width: isMobile ? "100%" : 256,
                        height: 256,
                        pointerEvents:
                          project.status === "APPROVED" ||
                          project.status === "REJECTED" ||
                          project.status === "CANCELED"
                            ? "none"
                            : "auto",
                      }}
                      onClick={() => setSelectedProjectIndex(i)}
                      key={i}
                    >
                      <Card.Body className="d-flex flex-column w-100 h-75 justify-content-end">
                        <Card.Text className="d-inline-block w-100 m-0 text-center overflow-hidden word-wrap">
                          {project.metadata.title}
                        </Card.Text>
                        {selectedProjectIndex === i && (
                          <Card.Text className="position-absolute top-0 start-50 translate-middle mt-4 fs-6 text-primary">
                            Submit Below
                          </Card.Text>
                        )}
                      </Card.Body>
                      <Card.Footer className="position-relative d-flex align-items-bottom justify-content-center w-100 h-50 border-0 bg-transparent pt-0">
                        {project.status !== null ? (
                          <Stack
                            direction="horizontal"
                            gap={2}
                            className={`justify-content-center align-items-center fs-4 
                            ${
                              project.status === "PENDING"
                                ? "text-warning"
                                : project.status === "APPROVED"
                                  ? "text-success"
                                  : "text-danger"
                            }`}
                            onClick={() =>
                              setShowProjectUpdateModal(
                                project.status === "PENDING",
                              )
                            }
                          >
                            <Image
                              src={
                                project.status === "PENDING"
                                  ? "/pending.svg"
                                  : project.status === "REJECTED" ||
                                      project.status === "CANCELED"
                                    ? "/cancel-circle.svg"
                                    : "check-circle.svg"
                              }
                              alt="status"
                              width={42}
                              style={{
                                filter:
                                  project.status === "PENDING"
                                    ? "invert(87%) sepia(40%) saturate(4124%) hue-rotate(348deg) brightness(103%) contrast(110%)"
                                    : project.status === "REJECTED" ||
                                        project.status === "CANCELED"
                                      ? "invert(36%) sepia(58%) saturate(1043%) hue-rotate(313deg) brightness(89%) contrast(116%)"
                                      : "invert(39%) sepia(10%) saturate(3997%) hue-rotate(103deg) brightness(99%) contrast(80%)",
                              }}
                            />
                            {project.status === "PENDING"
                              ? "Pending"
                              : project.status === "REJECTED"
                                ? "Rejected"
                                : project.status === "CANCELED"
                                  ? "Canceled"
                                  : "Accepted"}
                            {project.status === "PENDING" && (
                              <Button
                                variant="transparent"
                                className="position-absolute bottom-0 end-0 p-3 border-0"
                                onClick={() => {
                                  setShowProjectUpdateModal(true);
                                }}
                                style={{
                                  filter:
                                    "invert(87%) sepia(40%) saturate(4124%) hue-rotate(348deg) brightness(103%) contrast(110%)",
                                }}
                              >
                                <Image src="/edit.svg" alt="edit" width={24} />
                              </Button>
                            )}
                          </Stack>
                        ) : (
                          <Button
                            variant="transparent"
                            className="position-absolute bottom-0 end-0 p-3 border-0"
                            onClick={() => {
                              setShowProjectUpdateModal(true);
                            }}
                          >
                            <Image src="/edit.svg" alt="edit" width={24} />
                          </Button>
                        )}
                      </Card.Footer>
                    </Card>
                  ),
                )}
                <Card
                  className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                  style={{ width: isMobile ? "100%" : 256, height: 256 }}
                  onClick={() => {
                    setShowProjectCreationModal(true);
                    setSelectedProjectIndex(null);
                  }}
                >
                  <Image src="/add.svg" alt="add" width={48} />
                  <Card.Text className="d-inline-block m-0 overflow-hidden text-center word-wrap">
                    Create a new project
                  </Card.Text>
                </Card>
              </Stack>
            )}
            <Button
              className={`mt-5 py-2 ${isMobile ? "w-100" : "w-25"}`}
              disabled={selectedProjectIndex === null}
              onClick={registerRecipient}
            >
              {isPending ? (
                <Spinner size="sm" className="m-auto" />
              ) : selectedProjectIndex !== null &&
                projects[selectedProjectIndex].status === "PENDING" ? (
                "Update Application"
              ) : (
                "Apply"
              )}
            </Button>
          </>
        )}
      </Stack>
      <ProjectCreationModal
        show={showProjectCreationModal}
        handleClose={() => setShowProjectCreationModal(false)}
        registryAddress={network.alloRegistry}
        setNewProfileId={(newProfileId) => setNewProfileId(newProfileId)}
      />
      {selectedProjectIndex !== null && (
        <ProjectUpdateModal
          show={showProjectUpdateModal}
          handleClose={() => setShowProjectUpdateModal(false)}
          registryAddress={network.alloRegistry}
          project={projects[selectedProjectIndex]}
          key={selectedProjectIndex}
        />
      )}
    </>
  );
}
