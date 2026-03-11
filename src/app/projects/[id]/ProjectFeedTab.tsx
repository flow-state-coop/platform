"use client";

import { useState, useEffect, useCallback } from "react";
import Spinner from "react-bootstrap/Spinner";
import ChatView from "@/app/flow-councils/components/ChatView";
import useRequireAuth from "@/hooks/requireAuth";

type ProjectFeedTabProps = {
  projectId: string;
  isManager: boolean;
  active?: boolean;
};

export default function ProjectFeedTab({
  projectId,
  isManager,
  active,
}: ProjectFeedTabProps) {
  const [chainId, setChainId] = useState<number | null>(null);
  const [councilId, setCouncilId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { hasSession, address, requireAuth } = useRequireAuth();

  const handleAuthRequired = useCallback(() => {
    requireAuth(() => {});
  }, [requireAuth]);

  useEffect(() => {
    let cancelled = false;

    const fetchRoundInfo = async () => {
      try {
        const res = await fetch(
          `/api/flow-council/projects/${projectId}/round-info`,
        );
        const data = await res.json();

        if (!cancelled && data.success) {
          setChainId(data.chainId);
          setCouncilId(data.councilId);
        }
      } catch (err) {
        if (!cancelled) console.error(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchRoundInfo();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  if (!chainId || !councilId) {
    return (
      <p className="text-muted py-5 text-center">
        No feed available for this project.
      </p>
    );
  }

  return (
    <ChatView
      channelType="PUBLIC_PROJECT"
      chainId={chainId}
      councilId={councilId}
      projectId={Number(projectId)}
      canWrite={isManager}
      canModerate={isManager && hasSession}
      currentUserAddress={address}
      newestFirst
      emptyMessage="No posts yet."
      active={active}
      onAuthRequired={!hasSession ? handleAuthRequired : undefined}
    />
  );
}
