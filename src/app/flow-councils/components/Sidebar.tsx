"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccount, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useQuery, gql } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Offcanvas from "react-bootstrap/Offcanvas";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Network } from "@/types/network";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { networks, isFlowCouncilNetwork } from "@/lib/networks";

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
  { path: "funding", label: "Funding" },
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
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    networks.find((network) => network.label === "celo")!,
  );

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

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
  // The launch "Create New" page carries the chosen network in the `?chainId=`
  // query string rather than a path segment, so fall back to it there.
  const queryChainId = Number(searchParams?.get("chainId")) || null;
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { isMobile, isTablet } = useMediaQuery();

  // Keep the network dropdown in sync with the council currently open in the URL.
  useEffect(() => {
    const targetChainId = chainId ?? queryChainId;
    if (!targetChainId) {
      return;
    }
    const network = networks.find((n) => n.id === targetChainId);
    if (network && isFlowCouncilNetwork(network)) {
      setSelectedNetwork(network);
    }
  }, [chainId, queryChainId]);

  const { data: flowCouncilsQueryRes } = useQuery(FLOW_COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", selectedNetwork.id),
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
              `/api/flow-council/rounds?chainId=${selectedNetwork.id}&flowCouncilAddress=${id}`,
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
  }, [councilIdsKey, selectedNetwork.id]);

  const renderNetworkDropdown = () => (
    <Dropdown className="position-static w-75 overflow-hidden">
      <Dropdown.Toggle
        variant="transparent"
        className="d-flex justify-content-between align-items-center w-100 border border-4 border-dark fw-semi-bold py-4 overflow-hidden"
      >
        <Stack
          direction="horizontal"
          gap={2}
          className="align-items-center overflow-hidden"
        >
          <Image
            src={selectedNetwork.icon}
            alt="Network Icon"
            width={18}
            height={18}
          />
          <span className="d-inline-block text-truncate">
            {selectedNetwork.name}
          </span>
        </Stack>
      </Dropdown.Toggle>
      <Dropdown.Menu
        className="overflow-hidden border-4 border-dark lh-sm"
        style={{ width: isMobile || isTablet ? 300 : "auto" }}
      >
        {networks.filter(isFlowCouncilNetwork).map((network) => (
          <Dropdown.Item
            key={network.id}
            className="text-truncate fw-semi-bold"
            onClick={() => {
              // Only point the sidebar at a network once a wallet is connected
              // on it — when switching (after a confirmed `onSuccess`) or when
              // already on it. A disconnected pick just opens the connect modal.
              if (!connectedChain) {
                if (openConnectModal) {
                  openConnectModal();
                }
              } else if (connectedChain.id !== network.id) {
                switchChain(
                  { chainId: network.id },
                  { onSuccess: () => setSelectedNetwork(network) },
                );
              } else {
                setSelectedNetwork(network);
              }
            }}
          >
            <Stack
              direction="horizontal"
              gap={2}
              className="align-items-center"
            >
              <Image
                src={network.icon}
                alt="Network Icon"
                width={16}
                height={16}
              />
              {network.name}
            </Stack>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );

  const renderCouncilsDropdown = () => (
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
        {councils?.map((council: Council) => (
          <Dropdown.Item
            key={council.id}
            className="text-truncate fw-semi-bold"
            onClick={() =>
              router.push(
                `/flow-councils/membership/${selectedNetwork.id}/${council.id}`,
              )
            }
          >
            {council?.name ?? "N/A"}
          </Dropdown.Item>
        ))}
        <Dropdown.Item
          className="text-truncate fw-semi-bold"
          onClick={() => {
            router.push(`/flow-councils/launch?chainId=${selectedNetwork.id}`);
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
          {renderNetworkDropdown()}
          {renderCouncilsDropdown()}
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
      {renderNetworkDropdown()}
      {renderCouncilsDropdown()}
      <SidebarLinks
        chainId={chainId}
        selectedCouncil={selectedCouncil}
        pathname={pathname}
      />
    </Stack>
  );
}

export default Sidebar;
