"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useSession } from "next-auth/react";
import Spinner from "react-bootstrap/Spinner";
import ChatView from "@/app/flow-councils/components/ChatView";

type ProjectFeedTabProps = {
  projectId: string;
  isManager: boolean;
  csrfToken: string;
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

  const { address } = useAccount();
  const { data: session } = useSession();

  useEffect(() => {
    const fetchRoundInfo = async () => {
      try {
        const res = await fetch(
          `/api/flow-council/projects/${projectId}/round-info`,
        );
        const data = await res.json();

        if (data.success) {
          setChainId(data.chainId);
          setCouncilId(data.councilId);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoundInfo();
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

  const hasSession = !!session && session.address === address;

  return (
    <ChatView
      channelType="PUBLIC_PROJECT"
      chainId={chainId}
      councilId={councilId}
      projectId={Number(projectId)}
      canWrite={isManager && hasSession}
      canModerate={isManager && hasSession}
      currentUserAddress={address}
      newestFirst
      emptyMessage="No posts yet."
      active={active}
    />
  );
}
