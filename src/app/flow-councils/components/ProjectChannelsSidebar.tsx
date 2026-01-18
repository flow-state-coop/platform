"use client";

import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";

type ProjectChannel = {
  projectId: number;
  projectName: string;
  applicationId: number;
  roundId: number;
};

type ProjectChannelsSidebarProps = {
  channels: ProjectChannel[];
  isLoading: boolean;
  selectedChannel: string | null;
  roundName: string;
  onSelectChannel: (channel: string) => void;
};

export default function ProjectChannelsSidebar(
  props: ProjectChannelsSidebarProps,
) {
  const { channels, isLoading, selectedChannel, roundName, onSelectChannel } =
    props;

  return (
    <Stack
      direction="vertical"
      gap={2}
      className="bg-lace-100 rounded-4 p-3"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <h4 className="fs-6 fw-semi-bold mb-0">{roundName}</h4>
      <span className="text-muted small mb-2">Communication Channels</span>

      {isLoading ? (
        <div className="d-flex justify-content-center py-3">
          <Spinner size="sm" />
        </div>
      ) : (
        <Stack direction="vertical" gap={1}>
          {/* Announcements channel - always shown first */}
          <button
            className={`btn btn-sm text-start border-0 rounded-3 px-2 py-1 bg-transparent text-dark ${
              selectedChannel === "announcements" ? "fw-bold" : ""
            }`}
            onClick={() => onSelectChannel("announcements")}
          >
            #Announcements
          </button>

          {/* Project channels */}
          {channels.map((channel) => (
            <button
              key={channel.projectId}
              className={`btn btn-sm text-start border-0 rounded-3 px-2 py-1 bg-transparent text-dark ${
                selectedChannel === String(channel.projectId) ? "fw-bold" : ""
              }`}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              onClick={() => onSelectChannel(String(channel.projectId))}
            >
              #{channel.projectName}
            </button>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
