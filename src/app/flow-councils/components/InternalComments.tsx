"use client";

import { useSession } from "next-auth/react";
import ChatView from "./ChatView";
import { ChannelType } from "@/generated/kysely";

type InternalCommentsProps = {
  applicationId: number;
  chainId: number;
  councilId: string;
};

export default function InternalComments(props: InternalCommentsProps) {
  const { applicationId, chainId, councilId } = props;

  const { data: session } = useSession();

  // For internal comments, users with access can both write and moderate
  // Access is controlled at the API level (DEFAULT_ADMIN_ROLE or RECIPIENT_MANAGER_ROLE)
  const canWrite = !!session?.address;
  const canModerate = !!session?.address; // Super admins can moderate

  return (
    <ChatView
      channelType={ChannelType.INTERNAL_APPLICATION}
      chainId={chainId}
      councilId={councilId}
      applicationId={applicationId}
      canWrite={canWrite}
      canModerate={canModerate}
      currentUserAddress={session?.address}
      showEmailCheckbox={true}
      emptyMessage="No comments yet."
      infoText="Internal comments are only visible to managers and admins with access to this application review."
    />
  );
}
