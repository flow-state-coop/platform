"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Offcanvas from "react-bootstrap/Offcanvas";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import StatusBadge from "./StatusBadge";
import { useMediaQuery } from "@/hooks/mediaQuery";

type ApplicationStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "GRADUATED"
  | "REMOVED"
  | "INCOMPLETE"
  | null;

type ApplicantSidebarProps = {
  chainId: number;
  councilId: string;
  projectId: string;
  projectName: string;
  roundName: string;
  applicationStatus: ApplicationStatus;
};

export default function ApplicantSidebar(props: ApplicantSidebarProps) {
  const {
    chainId,
    councilId,
    projectId,
    projectName,
    roundName,
    applicationStatus,
  } = props;

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const pathname = usePathname();
  const { isMobile, isTablet } = useMediaQuery();

  const applicationPath = `/flow-councils/application/${chainId}/${councilId}/${projectId}`;
  const communicationsPath = `/flow-councils/communications/${chainId}/${councilId}`;

  const isApplicationActive = pathname === applicationPath;

  // Show communications only when application exists (status !== null, not INCOMPLETE)
  const showCommunications =
    applicationStatus !== null && applicationStatus !== "INCOMPLETE";

  // Show announcements only when accepted
  const showAnnouncements = applicationStatus === "ACCEPTED";

  const SidebarContent = () => (
    <>
      <h2 className="fs-5 fw-semi-bold mb-1">{roundName}</h2>
      <p className="fs-6 text-muted mb-4">{projectName}</p>

      <Stack direction="vertical" gap={3}>
        <Link
          href={applicationPath}
          className={`d-flex align-items-center text-decoration-none ${isApplicationActive ? "fw-semi-bold" : ""}`}
          onClick={() => setShowMobileSidebar(false)}
        >
          <Image
            src={isApplicationActive ? "/dot-filled.svg" : "/dot-unfilled.svg"}
            alt="Bullet Point"
            width={24}
            height={24}
          />
          <span className="me-2">Application</span>
          <StatusBadge status={applicationStatus} />
        </Link>

        {showCommunications && (
          <>
            <p className="fs-6 text-muted mb-0 mt-3">Communications</p>

            <Link
              href={`${communicationsPath}?channel=${projectId}`}
              className="d-flex align-items-center text-decoration-none"
              onClick={() => setShowMobileSidebar(false)}
            >
              <Image
                src="/dot-unfilled.svg"
                alt="Bullet Point"
                width={24}
                height={24}
              />
              Project Chat
            </Link>

            {showAnnouncements && (
              <Link
                href={`${communicationsPath}?channel=announcements`}
                className="d-flex align-items-center text-decoration-none"
                onClick={() => setShowMobileSidebar(false)}
              >
                <Image
                  src="/dot-unfilled.svg"
                  alt="Bullet Point"
                  width={24}
                  height={24}
                />
                Announcements
              </Link>
            )}
          </>
        )}
      </Stack>
    </>
  );

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
            Application
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-6">
          <SidebarContent />
        </Offcanvas.Body>
      </Offcanvas>
    );
  }

  return (
    <Stack
      direction="vertical"
      gap={3}
      className="w-25 flex-shrink-0 align-self-start rounded-4 bg-lace-100 p-4 fs-6 me-5"
      style={{ position: "sticky", top: "1rem" }}
    >
      <SidebarContent />
    </Stack>
  );
}
