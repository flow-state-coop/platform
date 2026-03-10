"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import MilestoneCard from "./MilestoneCard";
import useSiwe from "@/hooks/siwe";
import type { ApplicationMilestones } from "./types";

type ProjectMilestonesTabProps = {
  projectId: string;
  isManager: boolean;
  csrfToken: string;
  scrollToMilestone?: string | null;
};

export default function ProjectMilestonesTab({
  projectId,
  isManager,
  csrfToken,
  scrollToMilestone,
}: ProjectMilestonesTabProps) {
  const [applications, setApplications] = useState<ApplicationMilestones[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { address } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/flow-council/projects/${projectId}/milestones`,
      );
      const data = await res.json();
      if (data.success) {
        setApplications(data.applications);
      }
    } catch (err) {
      console.error("Failed to fetch milestones:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  useEffect(() => {
    if (!isLoading && scrollToMilestone && applications.length > 0) {
      const el = document.getElementById(`milestone-${scrollToMilestone}`);
      if (el) {
        const timeout = setTimeout(
          () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
          100,
        );
        return () => clearTimeout(timeout);
      }
    }
  }, [isLoading, scrollToMilestone, applications]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  const hasMilestones = applications.some((a) => a.milestones.length > 0);

  if (!hasMilestones) {
    return (
      <p className="text-muted py-5 text-center">
        No milestones available for this project.
      </p>
    );
  }

  const hasSession = !!session && session.address === address;

  return (
    <div>
      {applications.map(
        (app) =>
          app.milestones.length > 0 && (
            <Form.Group key={app.applicationId} className="mb-4">
              <a
                href={`/flow-councils/${app.chainId}/${app.councilId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fs-lg fw-bold text-decoration-none d-inline-flex align-items-center gap-1 mb-2"
              >
                {app.roundName}
                <Image src="/open-new.svg" alt="" width={14} height={14} />
              </a>
              <Stack direction="vertical" gap={3}>
                {app.milestones.map((m) => (
                  <MilestoneCard
                    key={`${m.type}-${m.index}`}
                    milestone={m}
                    applicationId={app.applicationId}
                    projectId={projectId}
                    isManager={isManager}
                    onSaved={fetchMilestones}
                    hasSession={hasSession}
                    csrfToken={csrfToken}
                    address={address}
                    openConnectModal={openConnectModal}
                    handleSignIn={handleSignIn}
                  />
                ))}
              </Stack>
            </Form.Group>
          ),
      )}
    </div>
  );
}
