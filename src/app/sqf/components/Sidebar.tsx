"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import { useQuery, gql } from "@apollo/client";
import { useAccount } from "wagmi";
import Dropdown from "react-bootstrap/Dropdown";
import Offcanvas from "react-bootstrap/Offcanvas";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import { Program } from "@/types/program";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { fetchIpfsJson } from "@/lib/fetchIpfs";

type Pool = { id: string; metadata: { name: string } };

const PROGRAMS_QUERY = gql`
  query ProgramsQuery($address: String, $chainId: Int) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: "allo" }
      }
    ) {
      id
      metadataCid
      profileRolesByChainIdAndProfileId {
        address
        role
      }
    }
  }
`;

const POOLS_QUERY = gql`
  query PoolsQuery($chainId: Int, $profileId: String, $address: String) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        profileId: { equalTo: $profileId }
        poolRolesByChainIdAndPoolId: {
          some: { address: { equalTo: $address } }
        }
        tags: { contains: "allo" }
      }
    ) {
      id
      metadata
    }
  }
`;

function Sidebar() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const poolId = searchParams?.get("poolId");
  const profileId = searchParams?.get("profileId");
  const chainId = Number(searchParams?.get("chainId")) ?? null;
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { data: programsQueryRes } = useQuery(PROGRAMS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId,
    },
    skip: !address,
    pollInterval: 4000,
  });
  const { data: poolsQueryRes } = useQuery(POOLS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId,
      profileId,
      address: address?.toLowerCase() ?? "",
    },
    skip: !address || !profileId,
    pollInterval: 4000,
  });

  const isWrongNetwork = connectedChain?.id !== chainId;
  const selectedProfile = programs?.find(
    (program: Program) => program.id === profileId,
  );
  const selectedPool = poolsQueryRes?.pools.find(
    (pool: { id: string }) => pool.id === poolId,
  );
  const isCreatingNewPool = pathname === "/sqf/configure" && !selectedPool;

  useEffect(() => {
    (async () => {
      if (!programsQueryRes?.profiles) {
        return;
      }

      const programs = [];

      for (const profile of programsQueryRes.profiles) {
        const metadata = await fetchIpfsJson(profile.metadataCid);

        if (metadata?.type === "program") {
          programs.push({ ...profile, metadata });
        }
      }

      setPrograms(programs);
    })();
  }, [programsQueryRes]);

  useEffect(() => {
    (async () => {
      if (!poolsQueryRes?.pools) {
        return;
      }

      const pools = [];

      for (const pool of poolsQueryRes.pools) {
        const metadata = await fetchIpfsJson(pool.metadataCid);

        if (metadata) {
          pools.push({ ...pool, metadata });
        }
      }

      setPools(pools);
    })();
  }, [poolsQueryRes]);

  const SidebarLinks = () => {
    return (
      <>
        <Stack
          direction="vertical"
          gap={3}
          className={`rounded-4 flex-grow-0 p-3 border ${selectedPool && !isWrongNetwork ? "border-black" : ""} shadow`}
          style={{ color: !selectedPool || isWrongNetwork ? "#dee2e6" : "" }}
        >
          <Link
            href={`/sqf/configure/?chainId=${chainId}&profileId=${profileId}&poolId=${poolId}`}
            className={`d-flex align-items-center gap-1 text-decoration-none ${
              pathname?.startsWith("/sqf/configure") &&
              !!selectedPool &&
              !isWrongNetwork
                ? "fw-bold"
                : ""
            }`}
            style={{
              color: "inherit",
              pointerEvents:
                !!profileId && !!selectedPool && !isWrongNetwork
                  ? "auto"
                  : "none",
            }}
          >
            <Image
              src={`${pathname?.startsWith("/sqf/configure") && !!selectedPool && !isWrongNetwork ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
              alt="Bullet Point"
              width={24}
              height={24}
              style={{
                filter:
                  !selectedPool || isWrongNetwork
                    ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                    : "",
              }}
            />
            Configuration
          </Link>
          <Link
            href={`/sqf/review/?chainId=${chainId}&profileId=${profileId}&poolId=${poolId}`}
            className={`d-flex align-items-center gap-1 text-decoration-none ${
              pathname?.startsWith("/sqf/review") &&
              !!selectedPool &&
              !isWrongNetwork
                ? "fw-bold"
                : ""
            }`}
            style={{
              color: "inherit",
              pointerEvents: selectedPool && !isWrongNetwork ? "auto" : "none",
            }}
          >
            <Image
              src={`${pathname?.startsWith("/sqf/review") && !!selectedPool && !isWrongNetwork ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
              alt="Bullet Point"
              width={24}
              height={24}
              style={{
                filter:
                  !selectedPool || isWrongNetwork
                    ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                    : "",
              }}
            />
            Grantee Review
          </Link>
          <Link
            href={`/sqf/matching/?chainId=${chainId}&profileId=${profileId}&poolId=${poolId}`}
            className={`d-flex align-items-center gap-1 text-decoration-none ${
              pathname?.startsWith("/sqf/matching") &&
              !!selectedPool &&
              !isWrongNetwork
                ? "fw-bold"
                : ""
            }`}
            style={{
              color: "inherit",
              pointerEvents: selectedPool ? "auto" : "none",
            }}
          >
            <Image
              src={`${pathname?.startsWith("/sqf/matching") && !!selectedPool && !isWrongNetwork ? "/dot-filled.svg" : "/dot-unfilled.svg"}`}
              alt="Bullet Point"
              width={24}
              height={24}
              style={{
                filter:
                  !selectedPool || isWrongNetwork
                    ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                    : "",
              }}
            />
            Matching Funds
          </Link>
          <Link
            href={`/pool/?poolId=${poolId}&chainId=${chainId}`}
            style={{
              color: "inherit",
              pointerEvents:
                poolId && chainId && !isWrongNetwork ? "auto" : "none",
            }}
            className="d-flex align-items-center gap-1 text-decoration-none"
          >
            <Image
              src="/dot-unfilled.svg"
              alt="Bullet Point"
              width={24}
              height={24}
              style={{
                filter:
                  !selectedPool || isWrongNetwork
                    ? "invert(81%) sepia(66%) saturate(14%) hue-rotate(169deg) brightness(97%) contrast(97%)"
                    : "",
              }}
            />
            Pool UI
          </Link>
        </Stack>
      </>
    );
  };

  if (pathname === "/sqf") {
    return null;
  }

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
          <Offcanvas.Title className="fs-4 fw-bold">SQF Admin</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-4 px-3 py-4 fs-5">
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between w-100"
            style={{ color: isWrongNetwork ? "#dee2e6" : "" }}
          >
            Program
            <Dropdown className="position-static w-75 overflow-hidden">
              <Dropdown.Toggle
                disabled={isWrongNetwork}
                variant="transparent"
                className="d-flex justify-content-between align-items-center w-100 border border-2 overflow-hidden"
              >
                <span
                  className="d-inline-block text-truncate"
                  style={{
                    color: !selectedProfile
                      ? "#fff"
                      : isWrongNetwork
                        ? "#dee2e6"
                        : "",
                  }}
                >
                  {selectedProfile?.metadata?.name ?? "N/A"}
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {programs?.map((profile: Program, i: number) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      router.push(
                        `/sqf/pools/?chainId=${chainId}&profileId=${profile.id}`,
                      );
                    }}
                  >
                    {profile?.metadata?.name ?? "N/A"}
                  </Dropdown.Item>
                ))}
                <Dropdown.Item onClick={() => router.push("/sqf/?new=true")}>
                  Create New
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Stack>
          <Stack
            direction="horizontal"
            gap={2}
            className="justify-content-between w-100"
            style={{
              color:
                (!address || !isCreatingNewPool) &&
                (!selectedPool || isWrongNetwork)
                  ? "#dee2e6"
                  : "",
            }}
          >
            Pool
            <Dropdown className="position-static w-75 overflow-hidden">
              <Dropdown.Toggle
                disabled={
                  (!address || !isCreatingNewPool) &&
                  (!selectedPool || isWrongNetwork)
                }
                variant="transparent"
                className="d-flex justify-content-between align-items-center w-100 border border-2 overflow-hidden"
              >
                <span
                  className="d-inline-block text-truncate hidden"
                  style={{
                    color:
                      (!address || !isCreatingNewPool) &&
                      (!selectedPool || isWrongNetwork)
                        ? "#fff"
                        : "",
                  }}
                >
                  {selectedPool?.metadata?.name ?? "Create New"}
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {pools?.map(
                  (
                    pool: { id: string; metadata: { name: string } },
                    i: number,
                  ) => (
                    <Dropdown.Item
                      key={i}
                      onClick={() =>
                        router.push(
                          `/sqf/configure/?chainId=${chainId}&profileId=${profileId}&poolId=${pool.id}`,
                        )
                      }
                    >
                      {pool?.metadata?.name ?? "N/A"}
                    </Dropdown.Item>
                  ),
                )}
                <Dropdown.Item
                  onClick={() => {
                    router.push(
                      `/sqf/configure/?chainId=${chainId}&profileId=${profileId}`,
                    );
                  }}
                >
                  Create New
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Stack>
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
      style={{
        width: "25%",
        boxShadow: "0.5rem 0 0.5rem -2px rgba(0,0,0,0.2)",
      }}
    >
      <Stack
        direction="horizontal"
        gap={2}
        className="justify-content-between w-100"
        style={{ color: isWrongNetwork ? "#dee2e6" : "" }}
      >
        Program
        <Dropdown className="position-static w-75 overflow-hidden">
          <Dropdown.Toggle
            disabled={isWrongNetwork}
            variant="transparent"
            className="d-flex justify-content-between align-items-center w-100 border border-2 overflow-hidden"
          >
            {!programs ? (
              <Spinner size="sm" className="mx-auto p-2" />
            ) : (
              <span
                className="d-inline-block text-truncate"
                style={{
                  color: !selectedProfile
                    ? "#fff"
                    : isWrongNetwork
                      ? "#dee2e6"
                      : "",
                }}
              >
                {selectedProfile?.metadata?.name ?? "N/A"}
              </span>
            )}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {programs?.map((profile: Program, i: number) => (
              <Dropdown.Item
                key={i}
                onClick={() => {
                  router.push(
                    `/sqf/pools/?chainId=${chainId}&profileId=${profile.id}`,
                  );
                }}
              >
                {profile?.metadata?.name ?? "N/A"}
              </Dropdown.Item>
            ))}
            <Dropdown.Item onClick={() => router.push("/sqf/?new=true")}>
              Create New
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      <Stack
        direction="horizontal"
        gap={2}
        className="justify-content-between w-100"
        style={{
          color:
            (!address || !isCreatingNewPool) &&
            (!selectedPool || isWrongNetwork)
              ? "#dee2e6"
              : "",
        }}
      >
        Pool
        <Dropdown className="position-static w-75 overflow-hidden">
          <Dropdown.Toggle
            disabled={
              (!address || !isCreatingNewPool) &&
              (!selectedPool || isWrongNetwork)
            }
            variant="transparent"
            className="d-flex justify-content-between align-items-center w-100 border border-2 overflow-hidden"
          >
            <span
              className="d-inline-block text-truncate hidden"
              style={{
                color:
                  (!address || !isCreatingNewPool) &&
                  (!selectedPool || isWrongNetwork)
                    ? "#fff"
                    : "",
              }}
            >
              {selectedPool?.metadata?.name ?? "Create New"}
            </span>
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {pools?.map((pool: Pool, i: number) => (
              <Dropdown.Item
                key={i}
                onClick={() =>
                  router.push(
                    `/sqf/configure/?chainId=${chainId}&profileId=${profileId}&poolId=${pool.id}`,
                  )
                }
              >
                {pool?.metadata?.name ?? "N/A"}
              </Dropdown.Item>
            ))}
            <Dropdown.Item
              onClick={() => {
                router.push(
                  `/sqf/configure/?chainId=${chainId}&profileId=${profileId}`,
                );
              }}
            >
              Create New
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      <SidebarLinks />
    </Stack>
  );
}

export default Sidebar;
