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

const FLOW_COUNCIL_MANAGER_QUERY = gql`
  query FlowCouncilManagerQuery($address: String!) {
    flowCouncils(where: { flowCouncilManagers_: { account: $address } }) {
      id
      metadata
    }
  }
`;

type FlowCouncil = { id: string; name: string; description: string };

function Sidebar() {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [flowCouncils, setCouncils] = useState<FlowCouncil[]>([]);

  const searchParams = useSearchParams();
  const chainId = Number(searchParams?.get("chainId")) ?? null;
  const flowCouncilId = searchParams?.get("id");
  const pathname = usePathname();
  const router = useRouter();
  const { address } = useAccount();
  const { isMobile, isTablet } = useMediaQuery();
  const { data: flowCouncilsQueryRes } = useQuery(FLOW_COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", chainId ?? DEFAULT_CHAIN_ID),
    variables: {
      address: address?.toLowerCase(),
    },
    skip: !address,
    pollInterval: 4000,
  });
  const selectedFlowCouncil = flowCouncils?.find(
    (flowCouncil: { id: string }) =>
      flowCouncil.id === flowCouncilId?.toLowerCase(),
  );

  useEffect(() => {
    (async () => {
      if (!flowCouncilsQueryRes?.flowCouncils) {
        return;
      }

      const flowCouncils: FlowCouncil[] = [];
      const promises = [];

      for (const flowCouncil of flowCouncilsQueryRes.flowCouncils) {
        if (flowCouncil.metadata) {
          promises.push(
            (async () => {
              const metadata = await fetchIpfsJson(flowCouncil.metadata);

              flowCouncils.push({
                id: flowCouncil.id,
                name: metadata?.name ?? "Flow Council",
                description: metadata?.description ?? "Flow Council",
              });
            })(),
          );
        } else {
          flowCouncils.push({
            id: flowCouncil.id,
            name: "Flow Council",
            description: "N/A",
          });
        }
      }

      await Promise.all(promises);

      flowCouncils.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }

        if (a.name > b.name) {
          return 1;
        }

        return 0;
      });

      setCouncils(flowCouncils);
    })();
  }, [flowCouncilsQueryRes]);

  const SidebarLinks = () => {
    return (
      <Stack
        direction="vertical"
        gap={3}
        className={`rounded-4 flex-grow-0 p-3 border ${selectedFlowCouncil ? "border-black" : ""} shadow`}
        style={{ color: !selectedFlowCouncil ? "#dee2e6" : "" }}
      >
        <Link
          href={
            chainId && selectedFlowCouncil
              ? `/flow-councils/launch/?chainId=${chainId}&id=${selectedFlowCouncil.id}`
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
                !selectedFlowCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Launch Config
        </Link>
        <Link
          href={`/flow-councils/permissions/?chainId=${chainId}&id=${selectedFlowCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedFlowCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/permissions" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedFlowCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/permissions") && !!selectedFlowCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/permissions") &&
                !selectedFlowCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Permissions
        </Link>
        <Link
          href={`/flow-councils/voters/?chainId=${chainId}&id=${selectedFlowCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedFlowCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/voters" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedFlowCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/voters") && !!selectedFlowCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/voters") &&
                !selectedFlowCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Voters
        </Link>
        <Link
          href={`/flow-councils/review/?chainId=${chainId}&id=${selectedFlowCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedFlowCouncil?.id ? "text-info" : ""} ${pathname === "/flow-councils/review" ? "fw-bold" : ""}`}
          style={{ pointerEvents: !selectedFlowCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src={`${pathname?.startsWith("/flow-councils/review") && !!selectedFlowCouncil ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter:
                !pathname?.startsWith("/flow-councils/review") &&
                !selectedFlowCouncil
                  ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                  : "",
            }}
          />
          Recipients
        </Link>
        <Link
          href={`/flow-councils/${chainId}/${selectedFlowCouncil?.id}`}
          className={`d-flex align-items-center text-decoration-none ${!selectedFlowCouncil?.id ? "text-info" : ""}`}
          style={{ pointerEvents: !selectedFlowCouncil?.id ? "none" : "auto" }}
        >
          <Image
            src="/dot-unfilled.svg"
            alt="Bullet Point"
            width={24}
            height={24}
            style={{
              filter: !selectedFlowCouncil
                ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                : "",
            }}
          />
          UI
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
          {selectedFlowCouncil?.name ?? "Create New"}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="overflow-hidden"
        style={{ width: isMobile || isTablet ? 300 : "25%" }}
      >
        {flowCouncils?.map((flowCouncil: FlowCouncil, i: number) => (
          <Dropdown.Item
            key={i}
            className="text-truncate"
            onClick={() =>
              router.push(
                `/flow-councils/voters/?chainId=${chainId}&id=${flowCouncil.id}`,
              )
            }
          >
            {flowCouncil?.name ?? "N/A"}
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
