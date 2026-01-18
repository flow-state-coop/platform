"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import ApplicantSidebar from "@/app/flow-councils/components/ApplicantSidebar";
import useSiwe from "@/hooks/siwe";

type ApplicationStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "GRADUATED"
  | "REMOVED"
  | "INCOMPLETE"
  | null;

export default function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ chainId: string; councilId: string; projectId: string }>;
}) {
  const [resolvedParams, setResolvedParams] = useState<{
    chainId: string;
    councilId: string;
    projectId: string;
  } | null>(null);
  const [roundName, setRoundName] = useState<string>("Round");
  const [projectName, setProjectName] = useState<string>("Project");
  const [applicationStatus, setApplicationStatus] =
    useState<ApplicationStatus>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState<string>("");

  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();

  // Resolve params
  useEffect(() => {
    params.then((p) => setResolvedParams(p));
  }, [params]);

  // Get CSRF token from cookies
  useEffect(() => {
    const cookies = document.cookie.split(";");
    const csrfCookie = cookies.find((c) =>
      c.trim().startsWith("next-auth.csrf-token="),
    );
    if (csrfCookie) {
      setCsrfToken(csrfCookie.split("=")[1]?.split("|")[0] ?? "");
    }
  }, []);

  const chainId = resolvedParams ? Number(resolvedParams.chainId) : null;
  const councilId = resolvedParams?.councilId ?? null;
  const projectId = resolvedParams?.projectId ?? null;

  const fetchRoundInfo = useCallback(async () => {
    if (!chainId || !councilId) return;

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
        setRoundName(details?.name ?? "Round");
      }
    } catch (err) {
      console.error(err);
    }
  }, [chainId, councilId]);

  const fetchProjectInfo = useCallback(async () => {
    if (!projectId || projectId === "new" || !session?.address) return;

    try {
      const res = await fetch(
        `/api/flow-council/projects/${projectId}?managerAddress=${session.address}`,
      );
      const data = await res.json();
      if (data.success && data.project?.details) {
        const details =
          typeof data.project.details === "string"
            ? JSON.parse(data.project.details)
            : data.project.details;
        setProjectName(details?.name ?? "Project");
      }
    } catch (err) {
      console.error(err);
    }
  }, [projectId, session?.address]);

  const fetchApplicationStatus = useCallback(async () => {
    if (!chainId || !councilId || !projectId || projectId === "new") return;

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({ chainId, councilId }),
      });
      const data = await res.json();

      if (data.success && data.applications) {
        const app = data.applications.find(
          (a: { projectId: number }) => a.projectId === parseInt(projectId, 10),
        );
        if (app) {
          setApplicationStatus(app.status);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [chainId, councilId, projectId]);

  useEffect(() => {
    if (resolvedParams) {
      fetchRoundInfo();
    }
  }, [fetchRoundInfo, resolvedParams]);

  useEffect(() => {
    if (session?.address && resolvedParams) {
      setIsLoading(true);
      Promise.all([fetchProjectInfo(), fetchApplicationStatus()]).finally(() =>
        setIsLoading(false),
      );
    } else if (resolvedParams) {
      setIsLoading(false);
    }
  }, [
    fetchProjectInfo,
    fetchApplicationStatus,
    session?.address,
    resolvedParams,
  ]);

  // Handle new project case - no sidebar
  if (projectId === "new") {
    return <>{children}</>;
  }

  // Not authenticated
  if (!session || session.address !== address) {
    return (
      <Stack
        direction="vertical"
        className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        <Button
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4"
          onClick={() => {
            if (!address && openConnectModal) {
              openConnectModal();
            } else if (connectedChain?.id !== chainId) {
              // Chain mismatch - could add switch chain logic
            } else {
              handleSignIn(csrfToken);
            }
          }}
        >
          Sign In With Ethereum
        </Button>
      </Stack>
    );
  }

  // Loading state
  if (isLoading || !resolvedParams) {
    return (
      <Stack
        direction="vertical"
        className="justify-content-center align-items-center px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
      >
        <Spinner className="mt-5" />
      </Stack>
    );
  }

  return (
    <Stack
      direction="horizontal"
      gap={4}
      className="align-items-start position-relative px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
    >
      <ApplicantSidebar
        chainId={chainId!}
        councilId={councilId!}
        projectId={projectId!}
        projectName={projectName}
        roundName={roundName}
        applicationStatus={applicationStatus}
      />
      <div className="flex-grow-1">{children}</div>
    </Stack>
  );
}
