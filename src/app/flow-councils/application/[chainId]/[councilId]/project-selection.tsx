"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useSession } from "next-auth/react";
import { gql, useQuery } from "@apollo/client";
import Markdown from "@/components/Markdown";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import ProjectCard from "@/app/flow-councils/components/ProjectCard";
import type { FormSchema } from "@/app/flow-councils/types/formSchema";
import { generateApplicationTemplate } from "@/app/flow-councils/lib/generateApplicationTemplate";
import InfoTooltip from "@/components/InfoTooltip";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import useSiwe from "@/hooks/siwe";
import { Project, ProjectDetails } from "@/types/project";

function SkeletonProjectCard() {
  return (
    <Card
      className="rounded-5 border-4 overflow-hidden shadow placeholder-glow"
      style={{ borderColor: "#030303", height: 430 }}
    >
      <div className="bg-lace-100" style={{ height: 102 }} />
      <span
        className="placeholder rounded-4 bg-secondary position-absolute border border-4 border-white"
        style={{ width: 52, height: 52, bottom: 295, left: 16 }}
      />
      <Card.Body className="mt-5 p-4 pb-0">
        <span
          className="placeholder rounded bg-secondary d-block mb-3"
          style={{ width: "70%", height: 20 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-2"
          style={{ height: 14 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-2"
          style={{ width: "90%", height: 14 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-2"
          style={{ width: "75%", height: 14 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block"
          style={{ width: "50%", height: 14 }}
        />
      </Card.Body>
      <Card.Footer
        className="bg-lace-100 border-0 rounded-3"
        style={{ height: 52 }}
      />
    </Card>
  );
}

type ProjectSelectionProps = {
  chainId: number;
  councilId: string;
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

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      maxVotingSpread
      superToken
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

export default function ProjectSelection(props: ProjectSelectionProps) {
  const { chainId, councilId } = props;

  const [projects, setProjects] = useState<Project[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const selectedProjectIndex = null;
  const isSubmitting = false;
  const [applicationsClosed, setApplicationsClosed] = useState(false);
  const [councilMetadata, setCouncilMetadata] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);

  const router = useRouter();
  const { isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { data: session, status: sessionStatus } = useSession();
  const { handleSignIn } = useSiwe();

  const isAuthenticated = session && session.address === address;
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
      setProjectsLoading(false);
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
    } finally {
      setProjectsLoading(false);
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

      try {
        const [roundRes, schemaRes] = await Promise.all([
          fetch(
            `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
          ),
          fetch(
            `/api/flow-council/rounds/form-schema?chainId=${chainId}&flowCouncilAddress=${councilId}`,
          ),
        ]);

        const data = await roundRes.json();
        if (data.success && data.round) {
          setApplicationsClosed(data.round.applicationsClosed ?? false);

          if (data.round.details) {
            const details =
              typeof data.round.details === "string"
                ? JSON.parse(data.round.details)
                : data.round.details;
            setCouncilMetadata({
              name: details?.name ?? "Flow Council",
              description: details?.description ?? "N/A",
            });
          }
        }

        const schemaData = await schemaRes.json();
        if (schemaData.success && schemaData.formSchema) {
          setFormSchema(schemaData.formSchema);
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

  if (
    !chainId ||
    !network ||
    (flowCouncilQueryRes && !flowCouncilQueryRes.flowCouncil)
  ) {
    return <span className="m-auto fs-4 fw-bold">No council found</span>;
  }

  const pageLoading =
    sessionStatus === "loading" ||
    !councilMetadata ||
    !flowCouncilQueryRes ||
    !superfluidQueryRes;

  if (pageLoading) {
    return (
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52 placeholder-glow"
      >
        <span
          className="placeholder rounded bg-secondary d-block mt-5 mb-2"
          style={{ width: 280, height: 30 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-4"
          style={{ width: 220, height: 18 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-2"
          style={{ height: 16 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-2"
          style={{ width: "80%", height: 16 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-5"
          style={{ width: "45%", height: 16 }}
        />
        <span
          className="placeholder rounded bg-secondary d-block mb-3"
          style={{ width: 160, height: 28 }}
        />
      </Stack>
    );
  }

  const applicationPreviewLink = !applicationsClosed && formSchema && (
    <Button
      variant="link"
      className="text-primary p-0 text-decoration-underline"
      onClick={() => {
        const { content, filename } = generateApplicationTemplate(
          formSchema,
          councilMetadata.name,
        );
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Download Application Template
    </Button>
  );

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
      <Markdown className="fs-6 text-info">
        {councilMetadata.description}
      </Markdown>
      <h2 className="mt-5 mb-2 fw-bold fs-3">
        {applicationsClosed
          ? "Applications Closed"
          : isAuthenticated
            ? "My Projects"
            : "Apply Now"}
      </h2>
      {!isAuthenticated ? (
        <Stack direction="vertical" gap={3} className="mt-4">
          <Card.Text className="fs-6 mb-0">
            {applicationsClosed
              ? "Applications for this Flow Council are currently closed. If you have an existing application, sign in to view or edit it."
              : "Sign in with your wallet to view and manage your projects."}{" "}
            {applicationPreviewLink}
          </Card.Text>
          <Button
            className="fs-lg fw-semi-bold rounded-4 px-10 py-4"
            style={{ width: "fit-content" }}
            onClick={() => {
              if (!address && openConnectModal) {
                openConnectModal();
              } else if (connectedChain?.id !== chainId) {
                switchChain({ chainId });
              } else {
                handleSignIn();
              }
            }}
          >
            {!address
              ? "Connect Wallet"
              : connectedChain?.id !== chainId
                ? "Switch Network"
                : "Sign In With Ethereum"}
          </Button>
        </Stack>
      ) : (
        <>
          <Card.Text className="fs-6">
            {applicationsClosed
              ? "Applications for this Flow Council are currently closed. You can still view and edit your existing applications below."
              : "Select or create a project to begin your application."}{" "}
            {applicationPreviewLink}
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
            {projectsLoading ? (
              <>
                <SkeletonProjectCard />
                <SkeletonProjectCard />
                <SkeletonProjectCard />
              </>
            ) : (
              <>
                {projectsWithStatus.map((project, i: number) => {
                  if (!project.details?.name) {
                    return null;
                  }

                  if (applicationsClosed && project.status === null) {
                    return null;
                  }

                  return (
                    <ProjectCard
                      key={project.id}
                      name={project.details.name}
                      description={project.details.description ?? ""}
                      logoUrl={project.details.logoUrl ?? ""}
                      bannerUrl={project.details.bannerUrl ?? ""}
                      status={project.status}
                      hasApplied={hasApplied}
                      canReapply={!applicationsClosed}
                      isSelected={selectedProjectIndex === i}
                      selectProject={() => {
                        router.push(
                          `/flow-councils/application/${chainId}/${councilId}/${project.id}`,
                        );
                      }}
                      updateProject={() => {
                        router.push(
                          `/flow-councils/application/${chainId}/${councilId}/${project.id}`,
                        );
                      }}
                      isTransactionConfirming={isSubmitting}
                    />
                  );
                })}
                {!applicationsClosed && (
                  <Card
                    className="d-flex flex-col justify-content-center align-items-center border-2 border-secondary rounded-4 fs-6 cursor-pointer"
                    style={{ height: 430 }}
                    onClick={() => {
                      router.push(
                        `/flow-councils/application/${chainId}/${councilId}/new`,
                      );
                    }}
                  >
                    <span className="fs-1 text-secondary">+</span>
                    <Card.Text className="d-inline-block m-0 overflow-hidden text-center word-wrap text-secondary">
                      Create Project
                    </Card.Text>
                  </Card>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Stack>
  );
}
