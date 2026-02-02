"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { usePostHog } from "posthog-js/react";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import ProjectModal from "@/app/flow-councils/components/ProjectModal";
import ProjectCard from "@/components/ProjectCard";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { Project, ProjectDetails } from "@/types/project";

type ProjectsProps = {
  csrfToken: string;
  owner: string | null;
};

export default function Projects(props: ProjectsProps) {
  const { csrfToken, owner } = props;

  const [showProjectCreationModal, setShowProjectCreationModal] =
    useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const postHog = usePostHog();

  const fetchProjects = useCallback(async () => {
    const managerAddress = owner ?? address;
    if (!managerAddress) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/flow-council/projects?managerAddress=${managerAddress}`,
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
      setLoading(false);
    }
  }, [address, owner]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (searchParams?.get("new")) {
      setShowProjectCreationModal(true);
    }
  }, [searchParams]);

  useEffect(
    () => postHog.stopSessionRecording(),
    [postHog, postHog.decideEndpointWasHit],
  );

  return (
    <Stack direction="vertical" className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52">
      {loading || projects === null ? (
        <Spinner className="m-auto" />
      ) : (
        <>
          <Card.Text className="m-0 fs-5 fw-semi-bold">Projects</Card.Text>
          <Card.Text className="fs-lg">{owner ?? address}</Card.Text>
          <div
            className="pb-5 mt-4"
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
                className="d-flex flex-col justify-content-center align-items-center border-4 border-dark rounded-4 cursor-pointer"
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
                <Card.Text className="d-inline-block m-0 overflow-hidden fs-6 fw-semi-bold text-center word-wrap">
                  Create Project
                </Card.Text>
              </Card>
            ) : null}
            {projects?.map((project: Project) => {
              if (!project.details?.name) {
                return null;
              }

              return (
                <ProjectCard
                  key={project.id}
                  name={project.details.name}
                  description={project.details.description ?? ""}
                  logoUrl={project.details.logoUrl ?? ""}
                  bannerUrl={project.details.bannerUrl ?? ""}
                  selectProject={() => {
                    router.push(`/projects/${project.id}`);
                  }}
                  editProject={() =>
                    router.push(`/projects/${project.id}?edit=true`)
                  }
                  canEdit={
                    (!!owner &&
                      !!address &&
                      owner.toString().toLowerCase() ===
                        address.toLowerCase()) ||
                    (!owner && !!address)
                  }
                />
              );
            })}
          </div>
        </>
      )}
      <ProjectModal
        show={showProjectCreationModal}
        chainId={42220}
        csrfToken={csrfToken}
        handleClose={() => setShowProjectCreationModal(false)}
        onProjectCreated={fetchProjects}
        mode="create"
      />
    </Stack>
  );
}
