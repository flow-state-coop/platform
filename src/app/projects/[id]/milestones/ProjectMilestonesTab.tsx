"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import MilestoneCard from "./MilestoneCard";
import useSiwe from "@/hooks/siwe";
import type { ApplicationMilestones } from "./types";

type ProjectMilestonesTabProps = {
  projectId: string;
  isManager: boolean;
  csrfToken: string;
};

export default function ProjectMilestonesTab({
  projectId,
  isManager,
  csrfToken,
}: ProjectMilestonesTabProps) {
  const [applications, setApplications] = useState<ApplicationMilestones[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();

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
      {isManager && !hasSession && (
        <Button
          variant="secondary"
          className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4 w-100"
          onClick={() => {
            if (!address && openConnectModal) {
              openConnectModal();
            } else if (connectedChain?.id !== 42220) {
              switchChain({ chainId: 42220 });
            } else {
              handleSignIn(csrfToken);
            }
          }}
        >
          {!address
            ? "Connect Wallet"
            : connectedChain?.id !== 42220
              ? "Switch Network"
              : "Sign In With Ethereum"}
        </Button>
      )}
      {applications.map(
        (app) =>
          app.milestones.length > 0 && (
            <Form.Group key={app.applicationId} className="mb-4">
              <Form.Label className="fs-lg fw-bold">{app.roundName}</Form.Label>
              <Stack direction="vertical" gap={3}>
                {app.milestones.map((m) => (
                  <MilestoneCard
                    key={`${m.type}-${m.index}`}
                    milestone={m}
                    applicationId={app.applicationId}
                    projectId={projectId}
                    isManager={isManager && hasSession}
                    onSaved={fetchMilestones}
                  />
                ))}
              </Stack>
            </Form.Group>
          ),
      )}
    </div>
  );
}
