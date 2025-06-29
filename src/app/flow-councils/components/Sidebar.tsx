"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Offcanvas from "react-bootstrap/Offcanvas";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const COUNCIL_MANAGER_QUERY = gql`
  query FlowCouncilManagerQuery($address: String!) {
    councils(where: { councilManagers_: { account: $address } }) {
      id
      metadataCid
    }
  }
`;

type Council = { id: string; name: string; description: string };

function Sidebar() {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [councils, setCouncils] = useState<Council[]>([]);

  const searchParams = useSearchParams();
  const chainId = Number(searchParams?.get("chainId")) ?? null;
  const councilId = searchParams?.get("councilId");
  const pathname = usePathname();
  const router = useRouter();
  const { address } = useAccount();
  const { isMobile, isTablet } = useMediaQuery();
  const { data: councilsQueryRes } = useQuery(COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", chainId ?? DEFAULT_CHAIN_ID),
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
        className={`rounded-4 flex-grow-0 p-3 border ${selectedCouncil ? "border-black" : ""} shadow`}
        style={{ color: !selectedCouncil ? "#dee2e6" : "" }}
      >
        <Link
          href={
            chainId && selectedCouncil
              ? `/flow-councils/launch/?chainId=${chainId}&councilId=${selectedCouncil.id}`
              : "/flow-councils/launch"
          }
          className={`d-flex align-items-center text-decoration-none ${pathname === "/flow-councils/launch" ? "fw-bold" : ""}`}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/launch") ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/launch") &&
                !selectedCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Launch Config
        </Link>
        <Link
          href={`/flow-councils/permissions/?chainId=${chainId}&councilId=${selectedCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/permissions" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/permissions") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/permissions") &&
                !selectedCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Council Permissions
        </Link>
        <Link
          href={`/flow-councils/membership/?chainId=${chainId}&councilId=${selectedCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/membership" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/membership") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/membership") &&
                !selectedCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Council Membership
        </Link>
        <Link
          href={`/flow-councils/review/?chainId=${chainId}&councilId=${selectedCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/review" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/review") && !!selectedCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/review") &&
                !selectedCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Manage Recipients
        </Link>
        <Link
          href={`/flow-councils/${chainId}/${selectedCouncil?.id}`}
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
                ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
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
        disabled={!address}
        variant="transparent"
        className="d-flex justify-content-between align-items-center w-100 border border-2 overflow-hidden"
      >
        <span
          className="d-inline-block text-truncate hidden"
          style={{
            color: !address ? "#fff" : "",
          }}
        >
          {selectedCouncil?.name ?? "Create New"}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="overflow-hidden"
        style={{ width: isMobile || isTablet ? 300 : "25%" }}
      >
        {councils?.map((council: Council, i: number) => (
          <Dropdown.Item
            key={i}
            className="text-truncate"
            onClick={() =>
              router.push(
                `/flow-councils/membership/?chainId=${chainId}&councilId=${council.id}`,
              )
            }
          >
            {council?.name ?? "N/A"}
          </Dropdown.Item>
        ))}
        <Dropdown.Item
          onClick={() => {
            router.push(
              `/flow-councils/launch/?chainId=${chainId ?? DEFAULT_CHAIN_ID}`,
            );
          }}
        >
          Create New
        </Dropdown.Item>
      </Dropdown.Menu>
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
        style={{ width: "100%" }}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="fs-4 fw-bold">
            Flow Council Admin
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-5">
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
      className="w-25 svh-100 py-4 px-3 fs-5"
      style={{
        boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)",
      }}
    >
      <h1 className="fs-4 fw-bold">Flow Council Admin</h1>
      <CouncilsDropdown />
      <SidebarLinks />
    </Stack>
  );
}

export default Sidebar;
