"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import FormCheck from "react-bootstrap/FormCheck";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import ProjectUpdateModal from "@/components/ProjectUpdateModal";
import GranteeApplicationCard from "@/components/GranteeApplicationCard";
import Sidebar from "./components/Sidebar";
import { Project } from "@/types/project";
import { Pool } from "@/types/pool";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { alloAbi } from "@/lib/abi/allo";
import { getApolloClient } from "@/lib/apollo";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { strategyAbi } from "@/lib/abi/strategy";
import { erc721CheckerAbi } from "@/lib/abi/erc721Checker";
import { ZERO_ADDRESS } from "@/lib/constants";

type GranteeProps = {
  chainId: number | null;
  poolId: string | null;
};

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!, $poolId: String!) {
    profiles(
      first: 1000
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: ["allo"] }
      }
    ) {
      id
      anchorAddress
      metadataCid
      profileRolesByChainIdAndProfileId(first: 1000) {
        address
      }
    }
    pool(chainId: $chainId, id: $poolId) {
      strategyAddress
      metadataCid
      matchingToken
      allocationToken
      recipientsByPoolIdAndChainId(
        first: 1000
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

export default function Grantee(props: GranteeProps) {
  const { chainId, poolId } = props;

  const [profiles, setProfiles] = useState<Project[] | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<
    number | null
  >(null);
  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);
  const [showProjectUpdateModal, setShowProjectUpdateModal] = useState(false);
  const [newProfileId, setNewProfileId] = useState("");
  const [isTransactionConfirming, setIsTransactionConfirming] = useState(false);
  const [hasAgreedToCodeOfConduct, setHasAgreedToCodeOfConduct] =
    useState(false);

  const router = useRouter();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      address: address?.toLowerCase() ?? "",
      poolId,
    },
    skip: !address || !poolId,
    pollInterval: 3000,
  });
  const { writeContractAsync, isError } = useWriteContract();
  const { data: eligibilityMethod } = useReadContract({
    address: queryRes?.pool?.strategyAddress as Address,
    abi: strategyAbi,
    functionName: "getAllocationEligiblity",
  });
  const { data: nftChecker } = useReadContract({
    address: queryRes?.pool?.strategyAddress as Address,
    abi: strategyAbi,
    functionName: "checker",
    query: { enabled: !!eligibilityMethod },
  });
  const { data: requiredNftAddress } = useReadContract({
    address: nftChecker as Address,
    abi: erc721CheckerAbi,
    functionName: "erc721",
    query: { enabled: nftChecker && nftChecker !== ZERO_ADDRESS },
  });
  const publicClient = usePublicClient();

  const network = networks.filter((network) => network.id === chainId)[0];
  const recipients = queryRes?.pool?.recipientsByPoolIdAndChainId ?? null;
  const projects =
    profiles?.map((profile: Project) => {
      let recipientStatus = null;
      let recipientId = null;

      if (!recipients) {
        return null;
      }

      for (const recipient of recipients) {
        if (
          recipient.anchorAddress === profile.anchorAddress ||
          recipient.id === address?.toLowerCase()
        ) {
          recipientStatus = recipient.status;
          recipientId = recipient.id;
        }
      }

      return { ...profile, recipientId, status: recipientStatus };
    }) ?? null;
  const statuses = projects?.map((project) => project?.status);
  const hasApplied =
    !!statuses?.includes("APPROVED") || !!statuses?.includes("PENDING");

  useEffect(() => {
    (async () => {
      if (!queryRes?.profiles || !queryRes?.pool) {
        return;
      }

      const profiles = [];
      const pool = queryRes.pool;

      for (const profile of queryRes.profiles) {
        const metadata = await fetchIpfsJson(profile.metadataCid);

        if (metadata) {
          profiles.push({ ...profile, metadata });
        }
      }

      const poolMetadata = await fetchIpfsJson(pool.metadataCid);

      if (poolMetadata) {
        setPool({ ...pool, metadata: poolMetadata });
      }

      setProfiles(profiles);
    })();
  }, [queryRes]);

  useEffect(() => {
    if (!newProfileId || hasApplied) {
      return;
    }

    const projectIndex =
      projects
        ?.map((project) => project?.id)
        .indexOf(newProfileId as `0x${string}`) ?? -1;

    if (projectIndex > -1) {
      setSelectedProjectIndex(projectIndex);
      setNewProfileId("");
    }
  }, [newProfileId, projects, hasApplied]);

  const registerRecipient = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    if (
      selectedProjectIndex === null ||
      !projects ||
      !projects[selectedProjectIndex]
    ) {
      throw Error("Invalid profile");
    }

    if (!poolId) {
      throw Error("Pool not found");
    }

    const project = projects[selectedProjectIndex];
    const recipientData: `0x${string}` = encodeAbiParameters(
      parseAbiParameters("address, address, (uint256, string)"),
      [
        project.anchorAddress as Address,
        address,
        [BigInt(1), project.metadataCid],
      ],
    );

    try {
      setIsTransactionConfirming(true);

      const hash = await writeContractAsync({
        address: network.allo,
        abi: alloAbi,
        functionName: "registerRecipient",
        args: [BigInt(poolId.toString()), recipientData],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });

      setSelectedProjectIndex(null);
      setIsTransactionConfirming(false);
    } catch (err) {
      console.error(err);

      setIsTransactionConfirming(false);
    }
  };

  return (
    <>
      <Sidebar />
      <Stack direction="vertical" className={!isMobile ? "w-75" : "w-100"}>
        <Stack direction="vertical" gap={4} className="px-5 py-4 mb-5">
          {!loading && recipients !== null ? (
            <>Pool not found</>
          ) : loading || !chainId || !poolId ? (
            <Spinner className="m-auto" />
          ) : !network ? (
            <>Network not supported</>
          ) : !connectedChain ? (
            <>Please connect a wallet</>
          ) : (
            <>
              <Card className="border-0">
                <Card.Text as="h1" className="mb-3">
                  Select or create a project to apply to the pool
                </Card.Text>
                <Card.Text as="h2" className="fs-3">
                  {pool?.metadata?.name}
                </Card.Text>
                <Card.Text
                  className="overflow-hidden word-wrap"
                  style={{ maxHeight: "2lh" }}
                >
                  {pool?.metadata?.description}
                </Card.Text>
              </Card>
              <Dropdown>
                <Dropdown.Toggle
                  variant="transparent"
                  className={`d-flex justify-content-between align-items-center border border-2 ${isMobile || isTablet ? "" : "w-20"}`}
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
                  )?.symbol ?? "N/A"}
                </Card.Text>
                <Card.Text className="m-0">
                  - Matching Token:{" "}
                  {network.tokens.find(
                    (token) =>
                      token.address.toLowerCase() === pool?.matchingToken,
                  )?.symbol ?? "N/A"}
                </Card.Text>
                <Card.Text>
                  - Voter Eligibility NFT:{" "}
                  {(requiredNftAddress as Address) ?? "N/A"}
                </Card.Text>
              </Card>
              {loading ? (
                <Spinner className="m-auto" />
              ) : (
                <div
                  style={{
                    display: "grid",
                    columnGap: "1.5rem",
                    rowGap: "3rem",
                    gridTemplateColumns: isTablet
                      ? "repeat(1,minmax(0,1fr))"
                      : isSmallScreen
                        ? "repeat(2,minmax(0,1fr))"
                        : isMediumScreen || isBigScreen
                          ? "repeat(3,minmax(0,1fr))"
                          : "",
                  }}
                >
                  {projects?.map((project, i: number) => {
                    if (!project || !project.metadata?.title) {
                      return null;
                    }

                    return (
                      <GranteeApplicationCard
                        key={project.id}
                        name={project.metadata.title}
                        description={project.metadata.description}
                        logoCid={project.metadata.logoImg}
                        bannerCid={project.metadata.bannerImg}
                        status={project.status}
                        hasApplied={hasApplied}
                        isSelected={selectedProjectIndex === i}
                        selectProject={() =>
                          project.status === "APPROVED"
                            ? router.push(
                                `/grantee/tools/?chainId=${chainId}&poolId=${poolId}&recipientId=${project.recipientId}`,
                              )
                            : setSelectedProjectIndex(i)
                        }
                        updateProject={setShowProjectUpdateModal}
                        isTransactionConfirming={isTransactionConfirming}
                      />
                    );
                  })}
                  <Card
                    className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                    style={{ height: 418 }}
                    onClick={() => {
                      setShowProjectCreationModal(true);
                      setSelectedProjectIndex(null);
                    }}
                  >
                    <Image src="/add.svg" alt="add" width={52} />
                    <Card.Text className="d-inline-block m-0 overflow-hidden fs-3 text-center word-wrap">
                      Create a new project
                    </Card.Text>
                  </Card>
                </div>
              )}
              <Stack direction="vertical" gap={2} className="mt-5 text-light">
                <Stack
                  direction="horizontal"
                  gap={2}
                  className="align-items-start text-dark"
                >
                  <FormCheck
                    onChange={() =>
                      setHasAgreedToCodeOfConduct(!hasAgreedToCodeOfConduct)
                    }
                  />
                  <Card.Text>
                    I have read and agree to the{" "}
                    <Link href="/conduct" target="_blank">
                      Flow State Grantee Code of Conduct
                    </Link>
                    .
                  </Card.Text>
                </Stack>
                <Button
                  className={`${isMobile || isTablet ? "w-100" : "w-25"} py-2 text-light`}
                  disabled={
                    selectedProjectIndex === null || !hasAgreedToCodeOfConduct
                  }
                  onClick={registerRecipient}
                >
                  {isTransactionConfirming ? (
                    <Spinner size="sm" className="m-auto" />
                  ) : selectedProjectIndex !== null &&
                    projects?.[selectedProjectIndex]?.status === "PENDING" ? (
                    "Update Application"
                  ) : (
                    "Apply"
                  )}
                </Button>
                {isError && (
                  <Card.Text className="fs-6 text-danger">
                    Transaction Failed - Reapply Above.
                  </Card.Text>
                )}
              </Stack>
            </>
          )}
        </Stack>
        <ProjectCreationModal
          show={showProjectCreationModal}
          chainId={network.id}
          handleClose={() => setShowProjectCreationModal(false)}
          registryAddress={network?.alloRegistry}
          setNewProfileId={(newProfileId) => setNewProfileId(newProfileId)}
        />
        {projects &&
          selectedProjectIndex !== null &&
          projects[selectedProjectIndex] && (
            <ProjectUpdateModal
              show={showProjectUpdateModal}
              chainId={network.id}
              handleClose={() => setShowProjectUpdateModal(false)}
              registryAddress={network?.alloRegistry}
              project={projects[selectedProjectIndex]}
              key={selectedProjectIndex}
            />
          )}
      </Stack>
    </>
  );
}
