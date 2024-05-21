import { useState } from "react";
import { GetServerSideProps } from "next";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import { networks } from "@/lib/networks";
import { alloAbi } from "@/lib/abi/allo";

type GranteeProps = {
  poolId: string;
  chainId: string;
};

type Profile = {
  id: string;
  anchorAddress: string;
  metadataCid: string;
  metadata: { title: string };
  profileRolesByChainIdAndProfileId: { address: string };
};

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
      recipientsByPoolIdAndChainId(
        filter: { recipientAddress: { equalTo: $address } }
      ) {
        status
        anchorAddress
        recipientAddress
      }
    }
  }
`;

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { query } = ctx;

  return { props: { poolId: query.poolid, chainId: query.chainid } };
};

export default function Grantee(props: GranteeProps) {
  const { poolId, chainId } = props;

  const [selectedProfileIndex, setSelectedProfileIndex] = useState<
    number | null
  >(null);
  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);

  const { address, chain: connectedChain } = useAccount();
  const { data: queryRes, loading } = useQuery(PROJECTS_QUERY, {
    variables: {
      chainId: Number(chainId),
      address: address?.toLowerCase() ?? "",
      poolId,
    },
    skip: !address || !poolId,
    pollInterval: 3000,
  });
  const { isPending, writeContract } = useWriteContract();
  const publicClient = usePublicClient();

  const network = networks.filter(
    (network) => network.id === Number(chainId),
  )[0];
  const profiles = queryRes?.profiles ?? null;
  const recipientsByProfile =
    queryRes?.pool?.recipientsByPoolIdAndChainId ?? null;

  const getRecipientStatus = (profile: Profile) => {
    for (const recipient of recipientsByProfile) {
      if (
        recipient.anchorAddress === profile.anchorAddress ||
        recipient.recipientAddress === address?.toLowerCase()
      ) {
        return recipient.status;
      }
    }

    return null;
  };

  const registerRecipient = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    if (selectedProfileIndex === null) {
      throw Error("Invalid profile");
    }

    const profile = profiles[selectedProfileIndex];
    const recipientData: `0x${string}` = encodeAbiParameters(
      parseAbiParameters("address, address, (uint256, string)"),
      [profile.anchorAddress, address, [BigInt(1), profile.metadataCid]],
    );

    await writeContract({
      address: network.allo,
      abi: alloAbi,
      functionName: "registerRecipient",
      args: [BigInt(poolId!), recipientData],
    });

    setSelectedProfileIndex(null);
  };

  return (
    <>
      <Stack direction="vertical" gap={4} className="px-5 py-4">
        {!network ? (
          <>Network not supported</>
        ) : !poolId || (queryRes && queryRes.pool === null) ? (
          <>Pool not found</>
        ) : connectedChain?.id !== network.id ? (
          <>Wrong network</>
        ) : (
          <>
            <Card.Text as="h1">
              Select or create a project to apply to the pool
            </Card.Text>
            <Dropdown>
              <Dropdown.Toggle
                variant="transparent"
                className="d-flex justify-content-between align-items-center w-20 border border-2"
                disabled
              >
                {network.name}
              </Dropdown.Toggle>
            </Dropdown>
            {loading ? (
              <Spinner className="m-auto" />
            ) : (
              <Stack direction="horizontal" gap={5} className="flex-wrap">
                {profiles?.map((profile: Profile, i: number) => {
                  const recipientStatus = getRecipientStatus(profile);

                  return (
                    <Card
                      className={`d-flex justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer ${
                        recipientStatus === "APPROVED"
                          ? "border-5 border-success"
                          : recipientStatus === "REJECTED"
                            ? "border-5 border-danger"
                            : recipientStatus === "PENDING"
                              ? "border-5 border-warning"
                              : selectedProfileIndex === i
                                ? "border-5 border-primary"
                                : ""
                      }
                    `}
                      style={{
                        width: 256,
                        height: 256,
                        pointerEvents:
                          recipientStatus === "APPROVED" ||
                          recipientStatus === "REJECTED" ||
                          recipientStatus === "PENDING"
                            ? "none"
                            : "auto",
                      }}
                      onClick={() => setSelectedProfileIndex(i)}
                      key={i}
                    >
                      <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                        {profile.metadata.title}
                      </Card.Text>
                    </Card>
                  );
                })}
                <Card
                  className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
                  style={{ width: 256, height: 256 }}
                  onClick={() => setShowProjectCreationModal(true)}
                >
                  <Image src="/add.svg" alt="add" width={48} />
                  <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden text-center word-wrap">
                    Create a new project
                  </Card.Text>
                </Card>
              </Stack>
            )}
            <Button
              className="w-25 mauto mt-5 py-2"
              disabled={selectedProfileIndex === null}
              onClick={registerRecipient}
            >
              {isPending ? <Spinner size="sm" className="m-auto" /> : "Apply"}
            </Button>
          </>
        )}
      </Stack>
      <ProjectCreationModal
        show={showProjectCreationModal}
        handleClose={() => setShowProjectCreationModal(false)}
        registryAddress={network.alloRegistry}
      />
    </>
  );
}
