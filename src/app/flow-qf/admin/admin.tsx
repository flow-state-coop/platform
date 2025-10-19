"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProgramCreationModal from "./components/ProgramCreationModal";
import { Program } from "@/types/program";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { networks } from "./lib/networks";

const PROGRAMS_QUERY = gql`
  query ProgramsQuery($address: String, $chainId: Int) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: "allo" }
      }
    ) {
      id
      metadataCid
      profileRolesByChainIdAndProfileId {
        address
        role
      }
    }
  }
`;

export default function Admin() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [showProgramCreationModal, setShowProgramCreationModal] =
    useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: queryRes, loading } = useQuery(PROGRAMS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId: connectedChain?.id,
    },
    skip: !address,
    pollInterval: 4000,
  });

  const network = networks.filter(
    (network) => network.id === connectedChain?.id,
  )[0];

  useEffect(() => {
    (async () => {
      if (!queryRes?.profiles) {
        return;
      }

      const programs = [];

      for (const profile of queryRes.profiles) {
        const metadata = await fetchIpfsJson(profile.metadataCid);

        if (metadata?.type === "program") {
          programs.push({ ...profile, metadata });
        }
      }

      setPrograms(programs);
    })();
  }, [queryRes]);

  useEffect(() => {
    if (searchParams?.get("new")) {
      setShowProgramCreationModal(true);
    }
  }, [searchParams]);

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        <div className="mb-8">
          <h1 className="fs-5 fw-semi-bold">SQF Launchpad</h1>
          <h2 className="fs-lg">
            Streaming Quadratic Funding (SQF) is an open-ended, real-time
            implementation of quadratic funding. With this tool, you can launch
            & manage rounds with no code. Start by selecting or creating an Allo
            program.
          </h2>
          <Card.Link
            href="https://docs.flowstate.network/platform/streaming-qf/"
            target="_blank"
            className="fs-lg text-primary"
          >
            Learn more
          </Card.Link>{" "}
          or{" "}
          <Card.Link
            href="https://t.me/flowstatecoop"
            target="_blank"
            className="fs-lg text-primary"
          >
            get help
          </Card.Link>
          .
        </div>
        <Dropdown>
          <Dropdown.Toggle
            variant="transparent"
            className="d-flex justify-content-between align-items-center mb-4 border border-4 border-dark fw-semi-bold"
            style={{ width: 156 }}
          >
            {network?.name ?? networks[0].name}
          </Dropdown.Toggle>
          <Dropdown.Menu className="border border-4 border-dark lh-lg">
            {networks.map((network, i) => (
              <Dropdown.Item
                key={i}
                className="fw-semi-bold"
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
        {address && (loading || programs === null) ? (
          <Spinner className="m-auto" />
        ) : (
          <Stack direction="horizontal" gap={5} className="flex-wrap">
            {programs?.map((program, i: number) => (
              <Card
                className="d-flex justify-content-center align-items-center border-4 border-dark rounded-4 fs-lg fw-semi-bold cursor-pointer"
                style={{ width: 256, height: 256 }}
                onClick={() => {
                  router.push(
                    `/flow-qf/admin/pools/?chainId=${network?.id}&profileId=${program.id}`,
                  );
                }}
                key={i}
              >
                <Card.Text className="d-inline-block mw-100 m-0 overflow-hidden word-wrap">
                  {program.metadata.name}
                </Card.Text>
              </Card>
            ))}
            <Card
              className="d-flex flex-col justify-content-center align-items-center border-4 border-dark rounded-4 fs-lg fw-semi-bold cursor-pointer"
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
