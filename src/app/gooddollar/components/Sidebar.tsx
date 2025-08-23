"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Offcanvas from "react-bootstrap/Offcanvas";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { fetchIpfsJson } from "@/lib//fetchIpfs";
import { getApolloClient } from "@/lib/apollo";
import { councilConfig } from "../lib/councilConfig";
import { DEFAULT_CHAIN_ID } from "../lib/constants";

const COUNCIL_MANAGER_QUERY = gql`
  query FlowCouncilManagerQuery($address: String!) {
    councils(where: { councilManagers_: { account: $address } }) {
      id
      metadata
    }
  }
`;

type Council = { id: string; name: string; description: string };

function Sidebar() {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [councils, setCouncils] = useState<Council[]>([]);

  const searchParams = useSearchParams();
  const chainId = Number(searchParams?.get("chainId")) ?? DEFAULT_CHAIN_ID;
  const councilId = councilConfig[chainId]?.councilAddress;
  const pathname = usePathname();
  const { address } = useAccount();
  const { isMobile, isTablet } = useMediaQuery();
  const { data: councilsQueryRes } = useQuery(COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", chainId),
    variables: {
      address: address?.toLowerCase(),
    },
    skip: !address,
    pollInterval: 4000,
  });
  const selectedCouncil = councils?.find(
    (council: { id: string }) => council.id === councilId?.toLowerCase(),
  );

  useEffect(() => {
    (async () => {
      if (!councilsQueryRes?.councils) {
        return;
      }

      const councils: Council[] = [];
      const promises = [];

      for (const council of councilsQueryRes.councils) {
        if (council.metadata) {
          promises.push(
            (async () => {
              const metadata = await fetchIpfsJson(council.metadata);

              councils.push({
                id: council.id,
                name: metadata.name,
                description: metadata.description,
              });
            })(),
          );
        } else {
          councils.push({
            id: council.id,
            name: "Flow Council",
            description: "N/A",
          });
        }
      }

      await Promise.all(promises);

      councils.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }

        if (a.name > b.name) {
          return 1;
        }

        return 0;
      });

      setCouncils(councils);
    })();
  }, [councilsQueryRes]);

  const SidebarLinks = () => {
    return (
      <Stack
        direction="vertical"
        gap={3}
        className="rounded-4 flex-grow-0 mt-3"
      >
        <Link
          href={
            chainId
              ? `/gooddollar/admin/?chainId=${chainId}`
              : "/gooddollar/admin"
          }
          className={`d-flex align-items-center text-decoration-none ${pathname === "/gooddollar/admin" ? "fw-semi-bold" : ""}`}
        >
          <Image
            src={`${pathname?.startsWith("/gooddollar/admin") ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/gooddollar/admin") && !selectedCouncil
                  ? "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)"
                  : "",
            }}
          />
          Launch Config
        </Link>
        <Link
          href={`/gooddollar/permissions/?chainId=${chainId}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/gooddollar/permissions" ? "fw-mi-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/gooddollar/permissions") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/gooddollar/permissions") &&
                !selectedCouncil
                  ? "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)"
                  : "",
            }}
          />
          Council Permissions
        </Link>
        <Link
          href={`/gooddollar/membership/?chainId=${chainId}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/gooddollar/membership" ? "fw-semi-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/gooddollar/membership") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/gooddollar/membership") &&
                !selectedCouncil
                  ? "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)"
                  : "",
            }}
          />
          Council Membership
        </Link>
        <Link
          href={`/gooddollar/review/?chainId=${chainId}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/gooddollar/review" ? "fw-semi-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/gooddollar/review") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/gooddollar/review") && !selectedCouncil
                  ? "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)"
                  : "",
            }}
          />
          Manage Recipients
        </Link>
        <Link
          href={`/gooddollar/${chainId}/${selectedCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src="/dot-unfilled.svg"
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter: !selectedCouncil
                ? "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)"
                : "",
            }}
          />
          Council UI
        </Link>
      </Stack>
    );
  };

  const CouncilsDropdown = () => (
    <Dropdown className="position-static w-75 overflow-hidden">
      <Dropdown.Toggle
        disabled
        variant="transparent"
        className="d-flex justify-content-between align-items-center w-100 border border-4 border-dark  fw-semi-bold py-4 overflow-hidden"
      >
        <span
          className="d-inline-block text-truncate hidden"
          style={{
            color: !address ? "#fff" : "",
          }}
        >
          {selectedCouncil?.name ?? "N/A"}
        </span>
      </Dropdown.Toggle>
    </Dropdown>
  );

  if ((isMobile || isTablet) && !showMobileSidebar) {
    return (
      <Button
        className="position-absolute rounded-circle p-0"
        style={{
          top: "50%",
          left: -24,
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
            Flow Council Admin
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-6">
          <CouncilsDropdown />
          <SidebarLinks />
        </Offcanvas.Body>
      </Offcanvas>
    );
  }

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="w-33 h-100 rounded-4 bg-lace-100 ms-12 ms-xxl-16 p-4 fs-5 me-10"
    >
      <h1 className="fs-5 fw-semi-bold">Flow Council Admin</h1>
      <CouncilsDropdown />
      <SidebarLinks />
    </Stack>
  );
}

export default Sidebar;
