"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Offcanvas from "react-bootstrap/Offcanvas";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";

function Sidebar() {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const { isMobile } = useMediaQuery();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const poolId = searchParams?.get("poolId");
  const chainId = Number(searchParams?.get("chainId")) ?? null;

  const SidebarLinks = () => {
    return (
      <>
        <Link
          href={`/grantee/?chainId=${chainId}&poolId=${poolId}`}
          className={`${pathname === "/grantee" ? "fw-bold" : ""} text-decoration-none`}
          style={{
            pointerEvents: !chainId || !poolId ? "none" : "auto",
          }}
        >
          Pool Application
        </Link>
        <Link
          href={`/grantee/tools/?chainId=${chainId}&poolId=${poolId}`}
          className={`${pathname === "/grantee/tools" ? "fw-bold" : ""} text-decoration-none`}
          style={{
            pointerEvents: !chainId || !poolId ? "none" : "auto",
          }}
        >
          Grantee Tools
        </Link>
      </>
    );
  };

  if (isMobile && !showMobileSidebar) {
    return (
      <Button
        className="position-absolute rounded-circle p-0"
        style={{
          top: "50%",
          left: -24,
          width: 48,
          height: 48,
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

  if (isMobile && showMobileSidebar) {
    return (
      <Offcanvas
        show={showMobileSidebar}
        onHide={() => setShowMobileSidebar(false)}
        style={{ width: "100%" }}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="fs-4 fw-bold">
            SQF Grantee
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-5">
          <SidebarLinks />
        </Offcanvas.Body>
      </Offcanvas>
    );
  }

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="svh-100 py-4 px-3 fs-5"
      style={{ boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)" }}
    >
      <SidebarLinks />
    </Stack>
  );
}

export default Sidebar;
