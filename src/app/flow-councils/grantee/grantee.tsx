"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import { gql, useQuery } from "@apollo/client";
import { createVerifiedFetch } from "@helia/verified-fetch";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehyperExternalLinks from "rehype-external-links";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import ProjectCreationModal from "@/components/ProjectCreationModal";
import ProjectUpdateModal from "@/components/ProjectUpdateModal";
import GranteeApplicationCard from "@/components/GranteeApplicationCard";
import InfoTooltip from "@/components/InfoTooltip";
import { Project } from "@/types/project";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { IPFS_GATEWAYS } from "@/lib/constants";

type GranteeProps = {
  chainId?: number;
  councilId?: string;
  csfrToken: string;
};

type Application = {
  owner: string;
  recipient: string;
  chainId: number;
  councilId: string;
  metadata: string;
  status: Status;
};

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";

enum ErrorMessage {
  GENERIC = "Error: Please try again later",
}

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!) {
    profiles(
      first: 1000
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
      profileRolesByChainIdAndProfileId(first: 1000) {
        address
      }
    }
  }
`;

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String!) {
    council(id: $councilId) {
      id
      maxAllocationsPerMember
      distributionToken
      metadata
      councilMembers {
        id
        account
        votingPower
      }
    }
  }
`;

const SUPERFLUID_QUERY = gql`
  query SuperfluidQuery($token: String!) {
    token(id: $token) {
      id
      symbol
    }
  }
`;

export default function Grantee(props: GranteeProps) {
  const { chainId, councilId, csfrToken } = props;

  const [selectedProjectIndex, setSelectedProjectIndex] = useState<
    number | null
  >(null);
  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);
  const [showProjectUpdateModal, setShowProjectUpdateModal] = useState(false);
  const [newProfileId, setNewProfileId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [councilMetadata, setCouncilMetadata] = useState({
    name: "",
    description: "",
  });
  const [applications, setApplications] = useState<Application[]>([]);
  const [customReceiver, setCustomReceiver] = useState("");
  const [isCustomReceiver, setIsCustomReceiver] = useState(false);
  const [hasAgreedToCodeOfConduct, setHasAgreedToCodeOfConduct] =
    useState(false);

  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { data: flowStateQueryRes } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address,
    pollInterval: 3000,
  });
  const { data: councilQueryRes } = useQuery(COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      chainId,
      councilId: councilId?.toLowerCase(),
    },
    skip: !chainId || !councilId,
    pollInterval: 10000,
  });
  const council = councilQueryRes?.council;
  const { data: superfluidQueryRes } = useQuery(SUPERFLUID_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: { token: council?.distributionToken },
    pollInterval: 10000,
    skip: !council,
  });

  const network = networks.find((network) => network.id === chainId);
  const councilToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === council?.distributionToken,
  ) ?? {
    address: council?.distributionToken ?? "",
    name: superfluidQueryRes?.token?.symbol ?? "N/A",
    icon: "",
  };
  const isCustomReceiverInvalid =
    isCustomReceiver && !isAddress(customReceiver);

  const projects = useMemo(
    () =>
      flowStateQueryRes?.profiles?.map((profile: Project) => {
        let granteeStatus = null;

        if (!applications) {
          return null;
        }

        for (const application of applications) {
          if (
            application.owner === address?.toLowerCase() &&
            application.metadata === profile.id
          ) {
            granteeStatus = application.status;
          }
        }

        return { ...profile, status: granteeStatus };
      }) ?? null,
    [flowStateQueryRes, address, applications],
  );

  const statuses = projects?.map(
    (project: { status: Status }) => project?.status,
  );
  const hasApplied =
    statuses?.includes("APPROVED") || statuses?.includes("PENDING");

  useEffect(() => {
    (async () => {
      if (!council) {
        return;
      }

      try {
        const verifiedFetch = await createVerifiedFetch({
          gateways: IPFS_GATEWAYS,
        });
        const metadataRes = await verifiedFetch(`ipfs://${council.metadata}`);
        const metadata = await metadataRes.json();

        setCouncilMetadata({
          name: metadata?.name ?? "Flow Council",
          description: metadata?.description ?? "N/A",
        });
      } catch (err) {
        console.error(err);
      }
    })();
  }, [council]);

  const fetchApplications = useCallback(async () => {
    if (!council || !address || !chainId) {
      return;
    }

    const applicationsRes = await fetch("/api/flow-council/applications", {
      method: "POST",
      body: JSON.stringify({
        chainId,
        councilId: council.id,
      }),
    });

    const { success, applications } = await applicationsRes.json();

    if (success) {
      setApplications(
        applications.filter(
          (application: Application) =>
            application.owner === address.toLowerCase(),
        ),
      );
    }
  }, [council, address, chainId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (!newProfileId || hasApplied) {
      return;
    }

    const projectIndex = projects
      .map((project: Project) => project.id)
      .indexOf(newProfileId);

    if (projectIndex > -1) {
      setSelectedProjectIndex(projectIndex);
      setNewProfileId("");
    }
  }, [newProfileId, projects, hasApplied]);

  const addToWallet = (args: {
    address: string;
    symbol: string;
    decimals: number;
    image: string;
  }) => {
    const { address, symbol, decimals, image } = args;

    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address,
          symbol,
          decimals,
          image,
        },
      },
    });
  };

  const handleSubmit = async () => {
    if (!session) {
      throw Error("Account is not signed in");
    }

    if (selectedProjectIndex === null) {
      throw Error("Invalid profile");
    }

    if (!council) {
      throw Error("Council not found");
    }

    const project = projects[selectedProjectIndex];

    try {
      setIsSubmitting(true);
      setError("");

      const res = await fetch("/api/flow-council/apply", {
        method: "POST",
        body: JSON.stringify({
          owner: session.address,
          recipient:
            isCustomReceiver && !isCustomReceiverInvalid
              ? customReceiver
              : session.address,
          chainId,
          councilId: council.id,
          metadata: project.id,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        console.error(json.error);

        setError(ErrorMessage.GENERIC);
      } else {
        setSuccess(true);
      }

      fetchApplications();

      setSelectedProjectIndex(null);
      setIsSubmitting(false);
    } catch (err) {
      console.error(err);

      setIsSubmitting(false);
      setError(ErrorMessage.GENERIC);
    }
  };

  if (!chainId || !network || (councilQueryRes && !councilQueryRes.council)) {
    return <span className="m-auto fs-4 fw-bold">No council found</span>;
  }

  return (
    <Container
      className="mx-auto p-0 px-4 mb-5"
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
      <h1 className="mt-5 mb-0">{councilMetadata.name}</h1>
      <Stack
        direction="horizontal"
        gap={1}
        className="align-items-center mb-2 fs-6"
      >
        Distributing{" "}
        {!!councilToken.icon && (
          <Image src={councilToken.icon} alt="" width={18} height={18} />
        )}
        {superfluidQueryRes?.token?.symbol} on
        <Image src={network.icon} alt="" width={18} height={18} />
        {network.name}
        <Button
          variant="transparent"
          className="d-flex align-items-center p-0 border-0"
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : addToWallet({
                    address: council.distributionToken,
                    symbol: superfluidQueryRes?.token?.symbol,
                    decimals: 18,
                    image: councilToken?.icon ?? "",
                  });
          }}
        >
          <InfoTooltip
            position={{ top: true }}
            target={<Image width={24} src="/wallet.svg" alt="wallet" />}
            content={<>Add to Wallet</>}
          />
        </Button>
      </Stack>
      <Markdown
        className="fs-5 text-info"
        skipHtml={true}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehyperExternalLinks, { target: "_blank" }]]}
        components={{
          table: (props) => (
            <table className="table table-striped" {...props} />
          ),
        }}
      >
        {councilMetadata.description}
      </Markdown>
      <Card.Text className="mt-4 fs-4">
        Select or create a project to apply.
      </Card.Text>
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
          marginBottom: 8,
        }}
      >
        {projects?.map(
          (
            project: Project & {
              status: Status | null;
            },
            i: number,
          ) => (
            <GranteeApplicationCard
              key={project.id}
              name={project.metadata.title}
              description={project.metadata.description}
              logoCid={project.metadata.logoImg}
              bannerCid={project.metadata.bannerImg}
              status={project.status}
              hasApplied={hasApplied}
              canReapply={true}
              isSelected={selectedProjectIndex === i}
              selectProject={() =>
                project?.status !== "PENDING" && project?.status !== "APPROVED"
                  ? setSelectedProjectIndex(i)
                  : void 0
              }
              updateProject={setShowProjectUpdateModal}
              isTransactionConfirming={isSubmitting}
            />
          ),
        )}
        <Card
          className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer shadow"
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
      <Stack direction="vertical">
        <Card.Text className="mt-5 fs-3 fw-bold">
          Additional Application Information
        </Card.Text>
        <Card.Text className="mb-2">
          1) Do you want to receive funding for this round at the project owner
          address?* (This cannot be changed during the round.)
        </Card.Text>
        <Stack direction="horizontal" gap={5} className="fs-5">
          <Form.Check
            type="radio"
            label="Yes"
            checked={!isCustomReceiver}
            onChange={() => setIsCustomReceiver(false)}
          />
          <Form.Check
            type="radio"
            label="No"
            checked={isCustomReceiver}
            onChange={() => setIsCustomReceiver(true)}
          />
        </Stack>
        <Form.Group className="mt-2">
          <Form.Label className={`${!isCustomReceiver ? "text-info" : ""}`}>
            Funding Address* (Must be self-custody! e.g., Safe multisig, browser
            wallet EOA, etc.)
          </Form.Label>
          <Form.Control
            type="text"
            disabled={!isCustomReceiver}
            value={isCustomReceiver ? customReceiver : address ? address : ""}
            onChange={(e) => setCustomReceiver(e.target.value)}
          />
        </Form.Group>
      </Stack>
      <Stack direction="vertical" gap={3} className="mt-5 text-light">
        <Stack
          direction="horizontal"
          gap={2}
          className="align-items-start text-dark"
        >
          <Form.Check
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
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 py-2"
          disabled={!!session && session.address === address}
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : handleSignIn(csfrToken);
          }}
        >
          {!!session && session.address === address && (
            <Image
              src="/check-circle.svg"
              alt=""
              width={26}
              height={26}
              style={{
                filter:
                  "brightness(0) saturate(100%) invert(10%) sepia(48%) saturate(2881%) hue-rotate(119deg) brightness(100%) contrast(99%)",
              }}
            />
          )}
          Sign In With Ethereum
        </Button>
        <Button
          className="py-2 text-light"
          disabled={
            !session ||
            session.address !== address ||
            selectedProjectIndex === null ||
            isCustomReceiverInvalid ||
            !hasAgreedToCodeOfConduct
          }
          onClick={() => {
            !address && openConnectModal
              ? openConnectModal()
              : connectedChain?.id !== chainId
                ? switchChain({ chainId })
                : handleSubmit();
          }}
        >
          {isSubmitting ? <Spinner size="sm" className="m-auto" /> : "Apply"}
        </Button>
        <Toast
          show={success}
          delay={4000}
          autohide={true}
          onClose={() => setSuccess(false)}
          className="w-100 bg-success mt-2 p-3 fs-5 text-light"
        >
          Success!
        </Toast>
        {error && <Card.Text className="fs-6 text-danger">{error}</Card.Text>}
      </Stack>
      <ProjectCreationModal
        show={showProjectCreationModal}
        handleClose={() => setShowProjectCreationModal(false)}
        registryAddress={network?.alloRegistry}
        setNewProfileId={(newProfileId) => setNewProfileId(newProfileId)}
      />
      {selectedProjectIndex !== null && (
        <ProjectUpdateModal
          show={showProjectUpdateModal}
          handleClose={() => setShowProjectUpdateModal(false)}
          registryAddress={network?.alloRegistry}
          project={projects[selectedProjectIndex]}
          key={selectedProjectIndex}
        />
      )}
    </Container>
  );
}
