"use client";

import { useState } from "react";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Offcanvas from "react-bootstrap/Offcanvas";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";

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

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { isMobile, isTablet } = useMediaQuery();

  const handleSelectChannel = (channel: string) => {
    onSelectChannel(channel);
    setShowMobileSidebar(false);
  };

  const SidebarContent = () => (
    <>
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
            onClick={() => handleSelectChannel("announcements")}
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
              onClick={() => handleSelectChannel(String(channel.projectId))}
            >
              #{channel.projectName}
            </button>
          ))}
        </Stack>
      )}
    </>
  );

  // Mobile/Tablet: Show expansion button when sidebar is collapsed
  if ((isMobile || isTablet) && !showMobileSidebar) {
    return (
      <Button
        className="position-fixed rounded-circle p-0"
        style={{
          top: "50%",
          left: -24,
          transform: "translateY(-50%)",
          width: 48,
          height: 48,
          zIndex: 10,
        }}
        onClick={() => setShowMobileSidebar(true)}
      >
        <Image
          src="/arrow-right.svg"
          alt="Open"
          width={24}
          height={24}
          className="float-end"
          style={{
            filter:
              "invert(100%) sepia(100%) saturate(0%) hue-rotate(160deg) brightness(103%) contrast(103%)",
          }}
        />
      </Button>
    );
  }

  // Mobile/Tablet: Show offcanvas drawer when expanded
  if ((isMobile || isTablet) && showMobileSidebar) {
    return (
      <Offcanvas
        show={showMobileSidebar}
        onHide={() => setShowMobileSidebar(false)}
        className="p-4"
        style={{ width: "100%" }}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="fs-5 fw-semi-bold">
            Channels
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-2 px-3 py-4 fs-6">
          <SidebarContent />
        </Offcanvas.Body>
      </Offcanvas>
    );
  }

  // Desktop: Show full sidebar
  return (
    <Stack
      direction="vertical"
      gap={2}
      className="bg-lace-100 rounded-4 p-3"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <SidebarContent />
    </Stack>
  );
}
