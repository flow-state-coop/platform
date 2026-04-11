"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { DEFAULT_CHAIN_ID } from "@/lib/constants";

const FLOW_COUNCIL_MANAGER_QUERY = gql`
  query FlowCouncilManagerQuery($address: String!) {
    flowCouncils(where: { flowCouncilManagers_: { account: $address } }) {
      id
    }
  }
`;

type Council = { id: string; name: string; description: string };

const DIM_FILTER =
  "brightness(0) saturate(100%) invert(18%) sepia(52%) saturate(5005%) hue-rotate(181deg) brightness(95%) contrast(96%)";

const SIDEBAR_LINK_DEFS: {
  path: string;
  label: string;
  alwaysEnabled?: boolean;
}[] = [
  { path: "launch", label: "Launch", alwaysEnabled: true },
  { path: "round-metadata", label: "Metadata" },
  { path: "permissions", label: "Permissions" },
  { path: "form-builder", label: "Form Builder" },
  { path: "review", label: "Recipients" },
  { path: "membership", label: "Voters" },
  { path: "communications", label: "Communications" },
];

type SidebarLinksProps = {
  chainId: number | null;
  selectedCouncil: Council | undefined;
  pathname: string | null;
};

function SidebarLinks({
  chainId,
  selectedCouncil,
  pathname,
}: SidebarLinksProps) {
  return (
    <Stack direction="vertical" gap={3} className="rounded-4 flex-grow-0 mt-3">
      {SIDEBAR_LINK_DEFS.map(({ path, label, alwaysEnabled }) => {
        const href =
          alwaysEnabled && chainId && selectedCouncil
            ? `/flow-councils/${path}/${chainId}/${selectedCouncil.id}`
            : alwaysEnabled
              ? `/flow-councils/${path}`
              : `/flow-councils/${path}/${chainId}/${selectedCouncil?.id}`;
        const isActive = pathname?.startsWith(`/flow-councils/${path}`);
        const disabled = !alwaysEnabled && !selectedCouncil?.id;
        return (
          <Link
            key={path}
            href={href}
            className={`d-flex align-items-center text-decoration-none ${disabled ? "text-info" : ""} ${isActive ? "fw-semi-bold" : ""}`}
            style={{ pointerEvents: disabled ? "none" : "auto" }}
          >
            <Image
              src={
                isActive && !disabled ? "/dot-filled.svg" : "/dot-unfilled.svg"
              }
              alt="Bullet Point"
              width={24}
              height={24}
              style={{
                filter: !isActive && !selectedCouncil ? DIM_FILTER : "",
              }}
            />
            {label}
          </Link>
        );
      })}
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
            filter: !selectedCouncil ? DIM_FILTER : "",
          }}
        />
        UI
      </Link>
    </Stack>
  );
}

function Sidebar() {
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [councils, setCouncils] = useState<Council[]>([]);

  const pathname = usePathname();
  const router = useRouter();

  const { chainId, councilId } = useMemo(() => {
    const segments = pathname?.split("/").filter(Boolean) ?? [];
    if (segments.length >= 4 && segments[0] === "flow-councils") {
      return {
        chainId: Number(segments[2]) || null,
        councilId: segments[3] || null,
      };
    }
    return { chainId: null, councilId: null };
  }, [pathname]);
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
  const selectedCouncil = councils?.find(
    (council: { id: string }) => council.id === councilId?.toLowerCase(),
  );

  const councilIdsKey = useMemo(
    () =>
      (flowCouncilsQueryRes?.flowCouncils ?? [])
        .map((c: { id: string }) => c.id)
        .sort()
        .join(","),
    [flowCouncilsQueryRes],
  );

  useEffect(() => {
    if (!councilIdsKey) {
      return;
    }

    const ids: string[] = councilIdsKey.split(",").filter(Boolean);
    let cancelled = false;

    (async () => {
      const fetched = await Promise.all(
        ids.map(async (id: string) => {
          let roundName = "Flow Council";
          try {
            const res = await fetch(
              `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${id}`,
            );
            const data = await res.json();
            if (data.success && data.round?.details) {
              const details =
                typeof data.round.details === "string"
                  ? JSON.parse(data.round.details)
                  : data.round.details;
              roundName = details?.name ?? "Flow Council";
            }
          } catch (err) {
            console.error(err);
          }
          return {
            id,
            name: roundName || "Flow Council",
            description: "N/A",
          };
        }),
      );

      if (cancelled) return;

      fetched.sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      });

      setCouncils(fetched);
    })();

    return () => {
      cancelled = true;
    };
  }, [councilIdsKey, chainId]);

  const CouncilsDropdown = () => (
    <Dropdown className="position-static w-75 overflow-hidden">
      <Dropdown.Toggle
        disabled={!address}
        variant="transparent"
        className="d-flex justify-content-between align-items-center w-100 border border-4 border-dark  fw-semi-bold py-4 overflow-hidden"
      >
        <span className="d-inline-block text-truncate hidden">
          {selectedCouncil?.name ?? "Create New"}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="overflow-hidden border-4 border-dark lh-sm"
        style={{ width: isMobile || isTablet ? 300 : "auto" }}
      >
        {councils?.map((council: Council, i: number) => (
          <Dropdown.Item
            key={i}
            className="text-truncate fw-semi-bold"
            onClick={() =>
              router.push(
                `/flow-councils/membership/${chainId ?? DEFAULT_CHAIN_ID}/${council.id}`,
              )
            }
          >
            {council?.name ?? "N/A"}
          </Dropdown.Item>
        ))}
        <Dropdown.Item
          className="text-truncate fw-semi-bold"
          onClick={() => {
            router.push("/flow-councils/launch");
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
          <SidebarLinks
            chainId={chainId}
            selectedCouncil={selectedCouncil}
            pathname={pathname}
          />
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
      <SidebarLinks
        chainId={chainId}
        selectedCouncil={selectedCouncil}
        pathname={pathname}
      />
    </Stack>
  );
}

export default Sidebar;
