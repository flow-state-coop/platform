"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address, formatEther } from "viem";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery, useLazyQuery } from "@apollo/client";
import { useClampText } from "use-clamp-text";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Dropdown from "react-bootstrap/Dropdown";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import InfoTooltip from "@/components/InfoTooltip";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { truncateStr, formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type FlowSplittersProps = {
  defaultNetwork: Network;
};

type Pool = {
  id: string;
  name: string;
  poolAddress: string;
  symbol: string;
  token: string;
  isAdmin: boolean;
  flowRate: bigint;
  units: bigint;
  isConnected: boolean;
};

const FLOW_SPLITTER_ADMIN_QUERY = gql`
  query FlowSplitterAdminQuery($address: String!) {
    pools(where: { poolAdmins_: { address: $address } }) {
      id
      poolAddress
      token
      name
      symbol
    }
  }
`;

const FLOW_SPLITTER_MEMBERSHIPS_QUERY = gql`
  query FlowSplittersMembershipsQuery($poolAddresses: [String!]) {
    pools(where: { poolAddress_in: $poolAddresses }) {
      id
      poolAddress
      token
      name
      symbol
    }
  }
`;

const SF_POOL_MEMBERSHIPS_QUERY = gql`
  query SFPoolMembershipsQuery($address: String) {
    account(id: $address) {
      poolMemberships {
        units
        isConnected
        pool {
          id
          flowRate
          adjustmentFlowRate
          totalUnits
        }
      }
    }
  }
`;

export default function FlowSplitters(props: FlowSplittersProps) {
  const { defaultNetwork } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [pools, setPools] = useState<Pool[]>([]);

  const router = useRouter();
  const { data: walletClient } = useWalletClient();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const {
    data: flowSplitterAdminQueryRes,
    refetch: refetchFlowSplitterAdmin,
    loading: flowSplitterQueryLoading,
  } = useQuery(FLOW_SPLITTER_ADMIN_QUERY, {
    client: getApolloClient("flowSplitter", selectedNetwork.id),
    variables: {
      address: address?.toLowerCase(),
    },
    pollInterval: 10000,
    skip: !address,
  });
  const [getFlowSplitterMemberships] = useLazyQuery(
    FLOW_SPLITTER_MEMBERSHIPS_QUERY,
    {
      client: getApolloClient("flowSplitter", selectedNetwork.id),
    },
  );
  const {
    data: superfluidQueryRes,
    refetch: refetchSuperfluidQuery,
    loading: superfluidQueryLoading,
  } = useQuery(SF_POOL_MEMBERSHIPS_QUERY, {
    client: getApolloClient("superfluid", selectedNetwork.id),
    variables: { address: address?.toLowerCase() },
    pollInterval: 10000,
    skip: !address,
  });

  useEffect(() => {
    (async () => {
      if (!flowSplitterAdminQueryRes?.pools) {
        return;
      }

      const pools = [];
      const sfPoolMemberships = superfluidQueryRes?.account?.poolMemberships;
      const flowSplitterPoolMemberships = (
        await getFlowSplitterMemberships({
          variables: {
            poolAddresses: sfPoolMemberships?.map(
              (m: { pool: { id: string } }) => m.pool.id,
            ),
          },
        })
      )?.data;

      for (const poolAdmin of flowSplitterAdminQueryRes.pools) {
        const flowSplitterMember = flowSplitterPoolMemberships?.pools?.find(
          (pool: { poolAddress: string }) =>
            pool.poolAddress === poolAdmin.poolAddress,
        );
        const poolMembership = sfPoolMemberships?.find(
          (membership: { pool: { id: string } }) =>
            membership.pool.id === flowSplitterMember?.poolAddress,
        );

        let memberFlowRate = BigInt(0);

        if (poolMembership) {
          const adjustedFlowRate =
            BigInt(poolMembership.pool.flowRate) -
            BigInt(poolMembership.pool.adjustmentFlowRate);
          memberFlowRate =
            BigInt(poolMembership.pool.totalUnits) > 0
              ? (BigInt(poolMembership.units) * adjustedFlowRate) /
                BigInt(poolMembership.pool.totalUnits)
              : BigInt(0);
        }

        pools.push({
          id: BigInt(poolAdmin.id).toString(),
          name: poolAdmin.name,
          poolAddress: poolAdmin.poolAddress,
          symbol: poolAdmin.symbol,
          token: poolAdmin.token,
          isAdmin: true,
          flowRate: memberFlowRate,
          units: BigInt(poolMembership?.units ?? 0),
          isConnected: poolMembership?.isConnected ?? false,
        });
      }

      if (flowSplitterPoolMemberships?.pools) {
        for (const flowSplitterPool of flowSplitterPoolMemberships.pools) {
          if (
            flowSplitterAdminQueryRes?.pools
              .map((pool: { id: string }) => pool.id)
              .includes(flowSplitterPool.id)
          ) {
            continue;
          }

          const poolMembership = sfPoolMemberships?.find(
            (membership: { pool: { id: string } }) =>
              membership.pool.id === flowSplitterPool?.poolAddress,
          );

          let memberFlowRate = BigInt(0);

          if (poolMembership) {
            const adjustedFlowRate =
              BigInt(poolMembership.pool.flowRate) -
              BigInt(poolMembership.pool.adjustmentFlowRate);
            memberFlowRate =
              BigInt(poolMembership.pool.totalUnits) > 0
                ? (BigInt(poolMembership.units) * adjustedFlowRate) /
                  BigInt(poolMembership.pool.totalUnits)
                : BigInt(0);
          }

          if (BigInt(poolMembership.units) > 0) {
            pools.push({
              id: BigInt(flowSplitterPool.id).toString(),
              name: flowSplitterPool.name,
              poolAddress: flowSplitterPool.poolAddress,
              symbol: flowSplitterPool.symbol,
              token: flowSplitterPool.token,
              isAdmin: false,
              flowRate: memberFlowRate,
              units: BigInt(poolMembership?.units ?? 0),
              isConnected: poolMembership?.isConnected ?? false,
            });
          }
        }
      }

      setPools(pools);
    })();
  }, [
    flowSplitterAdminQueryRes,
    superfluidQueryRes,
    getFlowSplitterMemberships,
  ]);

  useEffect(() => {
    refetchFlowSplitterAdmin();
    refetchSuperfluidQuery();
  }, [
    address,
    selectedNetwork,
    refetchFlowSplitterAdmin,
    refetchSuperfluidQuery,
  ]);

  const addToWallet = (token: Token) => {
    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: token.address,
          symbol: (token.symbol ?? void 0) as string,
          decimals: 18,
          image: token.icon,
        },
      },
    });
  };

  const PoolCard = ({ pool, token }: { pool: Pool; token?: Token }) => {
    const [nameRef, { clampedText }] = useClampText({
      text:
        pool.name !== "Superfluid Pool" && pool.symbol !== "POOL"
          ? `${pool.name} (${pool.symbol})`
          : pool.name !== "Superfluid Pool"
            ? `${pool.name}`
            : pool.symbol !== "POOL"
              ? `${pool.symbol}`
              : `${truncateStr(pool.poolAddress, 14)}`,
      ellipsis: "...",
      lines: 3,
    });

    return (
      <Card
        className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4"
        style={{ height: 400 }}
      >
        <Card.Header className="h-25 bg-white border-0 rounded-4 py-3">
          <Card.Title
            ref={nameRef as React.RefObject<HTMLParagraphElement>}
            className="fs-4 text-center"
          >
            {clampedText}
          </Card.Title>
        </Card.Header>
        <Card.Body className="h-50">
          <Stack
            direction="horizontal"
            gap={1}
            className="justify-content-center mb-3"
          >
            <Card.Link
              href={selectedNetwork.superfluidDashboard}
              target="_blank"
              className="d-flex gap-2 align-items-center text-decoration-none"
            >
              {token && (
                <Image src={token.icon} alt="" width={22} height={22} />
              )}
              <Card.Text className="text-decoration-underline">
                {token?.symbol ?? truncateStr(pool.token, 14)}
              </Card.Text>
            </Card.Link>
            <Button
              variant="transparent"
              className="p-0"
              onClick={() =>
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== selectedNetwork.id
                    ? switchChain({ chainId: selectedNetwork.id })
                    : addToWallet(
                        token ?? {
                          address: pool.token as Address,
                          symbol: "",
                          icon: "",
                        },
                      )
              }
            >
              <InfoTooltip
                position={{ top: true }}
                target={
                  <Image
                    width={22}
                    height={22}
                    src="/wallet.svg"
                    alt="wallet"
                  />
                }
                content={<>Add to Wallet</>}
              />
            </Button>
          </Stack>
          {pool.isAdmin && pool.units === BigInt(0) ? (
            <Card.Text className="mb-0 fs-2 fw-bold text-center">
              Admin
            </Card.Text>
          ) : (
            <Stack direction="vertical" gap={1}>
              {pool.isConnected ? (
                <Stack
                  direction="horizontal"
                  gap={1}
                  className="justify-content-center"
                >
                  <Card.Text className="m-0 fs-2 fw-bold">
                    {formatNumber(
                      Number(
                        formatEther(pool.flowRate * BigInt(SECONDS_IN_MONTH)),
                      ),
                    )}
                  </Card.Text>
                  <Card.Text className="mt-2 mb-0 fs-6">/mo</Card.Text>
                </Stack>
              ) : (
                <Stack direction="vertical">
                  <Card.Text className="mb-0 fs-2 fw-bold text-center">
                    {Number(pool.units)}
                  </Card.Text>
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="align-items-start"
                  >
                    <Card.Text className="mb-0 small">
                      Unconnected Shares
                    </Card.Text>
                    <InfoTooltip
                      position={{ top: true }}
                      target={
                        <Image
                          src="/info.svg"
                          alt=""
                          width={16}
                          height={16}
                          className="mb-4"
                        />
                      }
                      content={
                        <>
                          Complete a one-time transaction to receive your Flow
                          Splitter stream in real-time. Your funds are safe, but
                          static until you connect your shares.
                        </>
                      }
                    />
                  </Stack>
                </Stack>
              )}
              {pool.isAdmin && (
                <Card.Text className="m-0 fs-6 text-center">Admin</Card.Text>
              )}
            </Stack>
          )}
        </Card.Body>
        <Card.Footer className="d-flex flex-column justify-content-end gap-1 w-100 h-25 bg-transparent border-0">
          {pool.isAdmin && (
            <Button
              variant="primary"
              className="w-100"
              onClick={() =>
                router.push(
                  `/flow-splitters/${selectedNetwork.id}/${pool.id}/admin`,
                )
              }
            >
              Edit
            </Button>
          )}
          {pool.isConnected ? (
            <Button
              variant="secondary"
              className="w-100"
              onClick={() =>
                router.push(`/flow-splitters/${selectedNetwork.id}/${pool.id}`)
              }
            >
              View
            </Button>
          ) : (
            <PoolConnectionButton
              network={selectedNetwork}
              poolAddress={pool.poolAddress}
              isConnected={pool.isConnected}
            />
          )}
        </Card.Footer>
      </Card>
    );
  };

  return (
    <Container
      className="mx-auto p-0 mb-5"
      style={{
        maxWidth:
          isMobile || isTablet
            ? "100%"
            : isSmallScreen
              ? 1000
              : isMediumScreen
                ? 1300
                : 1600,
      }}
    >
      {flowSplitterQueryLoading || superfluidQueryLoading ? (
        <span className="position-absolute top-50 start-50 translate-middle">
          <Spinner className="m-auto" />
        </span>
      ) : (
        <Stack direction="vertical" gap={3} className="p-4">
          <Stack
            direction="horizontal"
            gap={1}
            className="align-items-start mt-3"
          >
            <h1 className="m-0">Flow Splitters</h1>
            <InfoTooltip
              position={{ bottom: isMobile }}
              target={<Image src="/info.svg" alt="" width={18} height={18} />}
              content={
                <>
                  Flow Splitters allocate one or more incoming Superfluid token
                  streams proportional to recipients' shares of a pool in real
                  time.
                  <br />
                  <br />
                  They're great for grant restreaming, team salaries, and large,
                  dynamic community stream allocations. More tooling on the way!
                </>
              }
            />
          </Stack>
          <h2 className="fs-5">
            The easiest way to split streams to your team, guild, DAO, or
            community.
            <br />
            <Card.Link
              href="https://docs.flowstate.network/platform/flow-splitters/"
              target="blank"
              className="text-primary"
            >
              Learn more
            </Card.Link>{" "}
            or{" "}
            <Card.Link
              href="https://t.me/flowstatecoop"
              target="blank"
              className="text-primary"
            >
              get help.
            </Card.Link>
          </h2>
          <h3 className="mt-2 fs-5">
            {truncateStr(address ?? "", isMobile ? 20 : 42)}
          </h3>
          <Dropdown>
            <Dropdown.Toggle
              variant="transparent"
              className={`d-flex justify-content-between align-items-center border border-2 ${isMobile ? "" : "w-20"}`}
            >
              {selectedNetwork.name}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {networks.map((network, i) => (
                <Dropdown.Item
                  key={i}
                  onClick={() => {
                    if (!connectedChain && openConnectModal) {
                      openConnectModal();
                    } else if (connectedChain?.id !== network.id) {
                      switchChain({ chainId: network.id });
                    }

                    setSelectedNetwork(network);
                  }}
                >
                  {network.name}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <div
            className="pb-5"
            style={{
              display: "grid",
              columnGap: "1.5rem",
              rowGap: "3rem",
              gridTemplateColumns: isTablet
                ? "repeat(2,minmax(0,1fr))"
                : isSmallScreen
                  ? "repeat(3,minmax(0,1fr))"
                  : isMediumScreen || isBigScreen
                    ? "repeat(4,minmax(0,1fr))"
                    : "",
            }}
          >
            <Card
              className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer"
              style={{ height: 400 }}
              onClick={() => {
                if (address) {
                  router.push(
                    `/flow-splitters/launch/?chainId=${selectedNetwork.id}`,
                  );
                } else if (openConnectModal) {
                  openConnectModal();
                }
              }}
            >
              <Image src="/add.svg" alt="add" width={64} />
              <Card.Text className="d-inline-block m-0 overflow-hidden fs-2 text-center word-wrap">
                Create <br />
                Flow Splitter
              </Card.Text>
            </Card>
            {pools.map((pool, i) => {
              const token = selectedNetwork.tokens.find(
                (token) => token.address.toLowerCase() === pool.token,
              );

              return <PoolCard key={i} pool={pool} token={token} />;
            })}
          </div>
        </Stack>
      )}
    </Container>
  );
}
