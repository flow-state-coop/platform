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
          href={`/flow-qf/grantee/?chainId=${chainId}&poolId=${poolId}`}
          className={`d-flex align-items-center text-decoration-none ${pathname === "/flow-qf/grantee" ? "fw-semi-bold" : ""}`}
          style={{
            pointerEvents: !chainId || !poolId ? "none" : "auto",
          }}
        >
          <Image
            src={`${pathname === "/flow-qf/grantee" ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt=""
            width={24}
            height={24}
          />
          Pool Application
        </Link>
        <Link
          href={`/flow-qf/grantee/tools/?chainId=${chainId}&poolId=${poolId}`}
          className={`d-flex align-items-center text-decoration-none ${pathname === "/flow-qf/grantee/tools" ? "fw-semi-bold" : ""}`}
          style={{
            pointerEvents: !chainId || !poolId ? "none" : "auto",
          }}
        >
          <Image
            src={`${pathname === "/flow-qf/grantee/tools" ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt=""
            width={24}
            height={24}
          />
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
          <Offcanvas.Title className="fs-5 fw-semi-bold">
            SQF Grantee
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-6">
          <SidebarLinks />
        </Offcanvas.Body>
      </Offcanvas>
    );
  }

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="w-33 h-100 rounded-4 bg-lace-100 ms-12 ms-xxl-16 p-4 fs-5"
    >
      <SidebarLinks />
    </Stack>
  );
}

export default Sidebar;
