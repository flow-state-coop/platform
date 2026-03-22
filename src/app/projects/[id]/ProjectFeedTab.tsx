"use client";

import { useCallback } from "react";
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
  const { hasSession, address, requireAuth } = useRequireAuth();

  const handleAuthRequired = useCallback(() => {
    requireAuth(() => {});
  }, [requireAuth]);

  return (
    <ChatView
      channelType="PUBLIC_PROJECT"
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
