"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import { gql, useQuery } from "@apollo/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehyperExternalLinks from "rehype-external-links";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Form from "react-bootstrap/Form";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import ProjectCard from "../components/ProjectCard";
import InfoTooltip from "@/components/InfoTooltip";
import ProjectModal from "../components/ProjectModal";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSiwe from "@/hooks/siwe";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";

type GranteeProps = {
  chainId?: number;
  councilId?: string;
  csfrToken: string;
};

type ProjectDetails = {
  name: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  github?: string;
};

type Project = {
  id: number;
  details: ProjectDetails | null;
  createdAt: string;
  updatedAt: string;
};

type Application = {
  id: number;
  projectId: number;
  roundId: number;
  fundingAddress: string;
  status: ApplicationStatus;
  projectDetails: ProjectDetails | null;
};

type ApplicationStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "REMOVED"
  | "GRADUATED";

enum ErrorMessage {
  GENERIC = "Error: Please try again later",
}

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      maxVotingSpread
      superToken
      metadata
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<
    number | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [councilMetadata, setCouncilMetadata] = useState({
    name: "",
    description: "",
  });
  const [customReceiver, setCustomReceiver] = useState("");
  const [isCustomReceiver, setIsCustomReceiver] = useState(false);
  const [hasAgreedToCodeOfConduct, setHasAgreedToCodeOfConduct] =
    useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const { isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { data: flowCouncilQueryRes } = useQuery(FLOW_COUNCIL_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      chainId,
      councilId: councilId?.toLowerCase(),
    },
    skip: !chainId || !councilId,
    pollInterval: 10000,
  });
  const flowCouncil = flowCouncilQueryRes?.flowCouncil;
  const { data: superfluidQueryRes } = useQuery(SUPERFLUID_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: { token: flowCouncil?.superToken },
    pollInterval: 10000,
    skip: !flowCouncil,
  });

  const network = networks.find((network) => network.id === chainId);
  const councilToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === flowCouncil?.superToken,
  ) ?? {
    address: flowCouncil?.superToken ?? "",
    name: superfluidQueryRes?.token?.symbol ?? "N/A",
    icon: "",
  };
  const isCustomReceiverInvalid =
    isCustomReceiver && !isAddress(customReceiver);

  const projectsWithStatus = useMemo(() => {
    return projects.map((project) => {
      const application = applications.find(
        (app) => app.projectId === project.id,
      );
      return {
        ...project,
        status: application?.status ?? null,
      };
    });
  }, [projects, applications]);

  const statuses = projectsWithStatus.map((project) => project.status);
  const hasApplied =
    statuses.includes("ACCEPTED") || statuses.includes("SUBMITTED");

  const fetchProjects = useCallback(async () => {
    if (!address) {
      return;
    }

    try {
      const res = await fetch(
        `/api/flow-council/projects?managerAddress=${address}`,
      );
      const { success, projects } = await res.json();

      if (success) {
        const parsedProjects = projects.map(
          (project: {
            id: number;
            details: string | ProjectDetails | null;
            createdAt: string;
            updatedAt: string;
          }) => ({
            ...project,
            details:
              typeof project.details === "string"
                ? JSON.parse(project.details)
                : project.details,
          }),
        );
        setProjects(parsedProjects);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    }
  }, [address]);

  const fetchApplications = useCallback(async () => {
    if (!flowCouncil || !chainId) {
      return;
    }

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
        }),
      });
      const { success, applications } = await res.json();

      if (success) {
        const parsedApplications = applications.map(
          (
            app: Application & {
              projectDetails: string | ProjectDetails | null;
            },
          ) => ({
            ...app,
            projectDetails:
              typeof app.projectDetails === "string"
                ? JSON.parse(app.projectDetails)
                : app.projectDetails,
          }),
        );
        setApplications(parsedApplications);
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    }
  }, [flowCouncil, chainId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    (async () => {
      if (!councilId || !chainId) {
        return;
      }

      // Fetch round metadata from database
      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();
        if (data.success && data.round?.details) {
          const details =
            typeof data.round.details === "string"
              ? JSON.parse(data.round.details)
              : data.round.details;
          setCouncilMetadata({
            name: details?.name ?? "Flow Council",
            description: details?.description ?? "N/A",
          });
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [councilId, chainId]);

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

    if (
      selectedProjectIndex === null ||
      !projectsWithStatus[selectedProjectIndex]
    ) {
      throw Error("Invalid project");
    }

    if (!flowCouncil) {
      throw Error("Flow Council not found");
    }

    const project = projectsWithStatus[selectedProjectIndex];

    try {
      setIsSubmitting(true);
      setError("");

      const res = await fetch("/api/flow-council/apply", {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          chainId,
          councilId: flowCouncil.id,
          fundingAddress:
            isCustomReceiver && !isCustomReceiverInvalid
              ? customReceiver
              : session.address,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        console.error(json.error);
        setError(json.error || ErrorMessage.GENERIC);
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

  if (
    !chainId ||
    !network ||
    (flowCouncilQueryRes && !flowCouncilQueryRes.flowCouncil)
  ) {
    return <span className="m-auto fs-4 fw-bold">No council found</span>;
  }

  return (
    <Stack direction="vertical" className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52">
      <h1 className="mt-5 mb-0 fs-3">{councilMetadata.name}</h1>
      <Stack direction="horizontal" gap={1} className="align-items-center mb-4">
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
                    address: flowCouncil.superToken,
                    symbol: superfluidQueryRes?.token?.symbol,
                    decimals: 18,
                    image: councilToken?.icon ?? "",
                  });
          }}
        >
          <InfoTooltip
            position={{ top: true }}
            target={<Image width={24} src="/wallet.svg" alt="wallet" />}
            content={<p className="m-0 p-2">Add to Wallet</p>}
          />
        </Button>
      </Stack>
      <Markdown
        className="fs-6 text-info"
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
      <Card.Text className="mt-4 fs-6">
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
        {projectsWithStatus.map((project, i: number) => {
          if (!project.details?.name) {
            return null;
          }

          const statusMap: Record<
            ApplicationStatus,
            "PENDING" | "APPROVED" | "REJECTED" | "CANCELED"
          > = {
            SUBMITTED: "PENDING",
            ACCEPTED: "APPROVED",
            CHANGES_REQUESTED: "PENDING",
            REJECTED: "REJECTED",
            REMOVED: "CANCELED",
            GRADUATED: "APPROVED",
          };

          const mappedStatus = project.status
            ? statusMap[project.status]
            : null;

          return (
            <ProjectCard
              key={project.id}
              name={project.details.name}
              description={project.details.description ?? ""}
              logoUrl={project.details.logoUrl ?? ""}
              bannerUrl={project.details.bannerUrl ?? ""}
              status={mappedStatus}
              hasApplied={hasApplied}
              canReapply={true}
              isSelected={selectedProjectIndex === i}
              selectProject={() => setSelectedProjectIndex(i)}
              updateProject={() => {
                setEditingProject(project);
                setShowProjectModal(true);
              }}
              isTransactionConfirming={isSubmitting}
            />
          );
        })}
        <Card
          className="d-flex flex-col justify-content-center align-items-center border-4 border-dark rounded-4 fs-6 cursor-pointer shadow"
          style={{ height: 418 }}
          onClick={() => {
            setEditingProject(null);
            setShowProjectModal(true);
            setSelectedProjectIndex(null);
          }}
        >
          <Image src="/add.svg" alt="add" width={52} />
          <Card.Text className="d-inline-block m-0 overflow-hidden text-center word-wrap">
            Create a new project
          </Card.Text>
        </Card>
      </div>
      <Stack direction="vertical">
        <Card.Text className="mt-8 fs-6 fw-semi-bold">
          Additional Application Information
        </Card.Text>
        <Card.Text className="mb-2">
          1) Do you want to receive funding for this round at the project owner
          address?* (This cannot be changed during the round.)
        </Card.Text>
        <Stack direction="horizontal" gap={5} className="fs-lg fw-semi-bold">
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
            className="border-0 py-3 bg-light fs-lg fw-semi-bold"
            onChange={(e) => setCustomReceiver(e.target.value)}
          />
        </Form.Group>
      </Stack>
      <Stack direction="vertical" gap={3} className="mt-8 text-light">
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
          className="d-flex justify-content-center align-items-center gap-2 py-4 rounded-4 fs-lg fw-semi-bold"
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
          className="py-4 rounded-4 fs-lg fw-semi-bold text-light"
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
          className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
        >
          Success!
        </Toast>
        {error && <Card.Text className="fs-6 text-danger">{error}</Card.Text>}
      </Stack>
      {chainId && (
        <ProjectModal
          show={showProjectModal}
          chainId={chainId}
          csrfToken={csfrToken}
          handleClose={() => {
            setShowProjectModal(false);
            setEditingProject(null);
          }}
          onProjectCreated={fetchProjects}
          mode={editingProject ? "edit" : "create"}
          project={editingProject ?? undefined}
        />
      )}
    </Stack>
  );
}
