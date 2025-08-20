"use client";

import { useState, useEffect } from "react";
import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Modal from "react-bootstrap/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import ActivityFeed from "../../components/ActivityFeed";
import PoolGraph from "../../components/PoolGraph";
import OpenFlow from "@/app/flow-splitters/components/OpenFlow";
import InstantDistribution from "@/app/flow-splitters/components/InstantDistribution";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import { truncateStr } from "@/lib/utils";
import { IPFS_GATEWAYS } from "@/lib/constants";

type FlowSplitterProps = {
  chainId: number;
  poolId: string;
};

const FLOW_SPLITTER_POOL_QUERY = gql`
  query FlowSplitterPoolQuery($poolId: String!) {
    pools(where: { id: $poolId }) {
      poolAddress
      name
      symbol
      token
      poolAdminRemovedEvents(orderBy: timestamp, orderDirection: asc) {
        address
        timestamp
        transactionHash
      }
      poolAdminAddedEvents(orderBy: timestamp, orderDirection: asc) {
        address
        timestamp
        transactionHash
      }
    }
  }
`;

const SUPERFLUID_QUERY = gql`
  query SuperfluidQuery($token: String!, $gdaPool: String!) {
    token(id: $token) {
      id
      symbol
    }
    pool(id: $gdaPool) {
      id
      flowRate
      totalUnits
      totalAmountFlowedDistributedUntilUpdatedAt
      totalAmountInstantlyDistributedUntilUpdatedAt
      updatedAtTimestamp
      poolMembers(first: 1000, where: { units_not: "0" }) {
        account {
          id
        }
        units
        isConnected
      }
      poolDistributors(first: 1000, where: { flowRate_not: "0" }) {
        account {
          id
        }
        flowRate
      }
      token {
        id
        symbol
      }
      poolCreatedEvent {
        timestamp
        transactionHash
        name
      }
      memberUnitsUpdatedEvents(
        first: 1000
        orderBy: timestamp
        orderDirection: desc
      ) {
        units
        oldUnits
        poolMember {
          account {
            id
          }
        }
        timestamp
        transactionHash
      }
      flowDistributionUpdatedEvents(
        first: 1000
        orderBy: timestamp
        orderDirection: desc
      ) {
        newDistributorToPoolFlowRate
        oldFlowRate
        poolDistributor {
          account {
            id
          }
        }
        timestamp
        transactionHash
      }
      instantDistributionUpdatedEvents(
        first: 1000
        orderBy: timestamp
        orderDirection: desc
      ) {
        requestedAmount
        poolDistributor {
          account {
            id
          }
        }
        timestamp
        transactionHash
      }
    }
  }
`;

export default function FlowSplitter(props: FlowSplitterProps) {
  const { poolId, chainId } = props;

  const [showOpenFlow, setShowOpenFlow] = useState(false);
  const [showInstantDistribution, setShowInstantDistribution] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [ensByAddress, setEnsByAddress] = useState<{
    [key: Address]: { name: string | null; avatar: string | null };
  } | null>(null);

  const router = useRouter();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { address, chain: connectedChain } = useAccount();
  const {
    data: flowSplitterPoolQueryRes,
    loading: flowSplitterPoolQueryLoading,
  } = useQuery(FLOW_SPLITTER_POOL_QUERY, {
    client: getApolloClient("flowSplitter", chainId),
    variables: {
      poolId: `0x${Number(poolId).toString(16)}`,
      address: address?.toLowerCase() ?? "",
    },
    pollInterval: 10000,
  });
  const pool = flowSplitterPoolQueryRes?.pools[0];
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SUPERFLUID_QUERY, {
      client: getApolloClient("superfluid", chainId),
      variables: { token: pool?.token, gdaPool: pool?.poolAddress },
      pollInterval: 10000,
      skip: !pool,
    });
  const postHog = usePostHog();

  const network = networks.find((network) => network.id === chainId);
  const poolToken = network?.tokens.find(
    (token) => token.address.toLowerCase() === pool?.token,
  ) ?? {
    address: pool?.token ?? "",
    symbol: superfluidQueryRes?.token.symbol ?? "N/A",
    icon: "",
  };
  const poolMember = superfluidQueryRes?.pool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

  useEffect(() => {
    const ensByAddress: {
      [key: Address]: { name: string | null; avatar: string | null };
    } = {};
    (async () => {
      if (!pool || !superfluidQueryRes) {
        return;
      }

      const addresses = [];

      for (const memberUnitsUpdatedEvent of superfluidQueryRes.pool
        .memberUnitsUpdatedEvents) {
        addresses.push(memberUnitsUpdatedEvent.poolMember.account.id);
      }

      for (const poolAdminAddedEvent of pool.poolAdminAddedEvents) {
        addresses.push(poolAdminAddedEvent.address);
      }

      for (const poolAdminRemovedEvent of pool.poolAdminRemovedEvents) {
        addresses.push(poolAdminRemovedEvent.address);
      }

      for (const flowDistributionUpdatedEvent of superfluidQueryRes.pool
        .flowDistributionUpdatedEvents) {
        addresses.push(flowDistributionUpdatedEvent.poolDistributor.account.id);
      }

      for (const instantDistributionUpdatedEvent of superfluidQueryRes.pool
        .instantDistributionUpdatedEvents) {
        addresses.push(
          instantDistributionUpdatedEvent.poolDistributor.account.id,
        );
      }

      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http("https://ethereum-rpc.publicnode.com", {
          batch: {
            batchSize: 100,
            wait: 10,
          },
        }),
      });

      try {
        const ensNames = await Promise.all(
          addresses.map((address) =>
            publicClient.getEnsName({
              address: address as Address,
            }),
          ),
        );

        const ensAvatars = await Promise.all(
          ensNames.map((ensName) =>
            publicClient.getEnsAvatar({
              name: normalize(ensName ?? ""),
              gatewayUrls: ["https://ccip.ens.xyz"],
              assetGatewayUrls: {
                ipfs: IPFS_GATEWAYS[0],
              },
            }),
          ),
        );

        for (const i in addresses) {
          ensByAddress[addresses[i] as Address] = {
            name: ensNames[i] ?? null,
            avatar: ensAvatars[i] ?? null,
          };
        }
      } catch (err) {
        console.error(err);
      }

      setEnsByAddress(ensByAddress);
    })();
  }, [pool, superfluidQueryRes]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const addToWallet = (args: {
    address: string;
    symbol: string;
    decimals: number;
    image: string;
  }) => {
    const { address, symbol, decimals, image } = args;

    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address,
          symbol,
          decimals,
          image,
        },
      },
    });
  };

  return (
    <>
      <Stack
        direction="vertical"
        className="px-2 pt-17 pb-30 px-lg-30 px-xxl-52"
      >
        {flowSplitterPoolQueryLoading || superfluidQueryLoading ? (
          <span className="position-absolute top-50 start-50 translate-middle">
            <Spinner />
          </span>
        ) : !network || !pool ? (
          <p className="w-100 fs-4 text-center">Flow Splitter Not Found</p>
        ) : (
          <>
            <h1 className="d-flex flex-column flex-sm-row align-items-sm-center overflow-hidden gap-sm-1 fs-3">
              <span className="text-truncate">
                {pool && pool.name !== "Superfluid Pool"
                  ? pool.name
                  : "Flow Splitter"}{" "}
                <span className="d-none d-sm-inline-block">(</span>
              </span>
              <Stack direction="horizontal" gap={1}>
                <Link
                  href={`${network.superfluidExplorer}/pools/${pool.poolAddress}`}
                  target="_blank"
                >
                  {truncateStr(pool.poolAddress, 14)}
                </Link>
                <span className="d-none d-sm-inline-block me-1">)</span>
                <Button
                  variant="transparent"
                  className="d-flex align-items-center mt-2 p-0 border-0"
                  onClick={() => {
                    !address && openConnectModal
                      ? openConnectModal()
                      : connectedChain?.id !== chainId
                        ? switchChain({ chainId })
                        : addToWallet({
                            address: pool.poolAddress,
                            symbol: pool.symbol,
                            decimals: 0,
                            image: "",
                          });
                  }}
                >
                  <InfoTooltip
                    position={{ top: true }}
                    target={<Image width={48} src="/wallet.svg" alt="wallet" />}
                    content={<p className="m-0 p-2">Add to Wallet</p>}
                  />
                </Button>
                <Button
                  variant="transparent"
                  className="mt-2 p-0 border-0"
                  onClick={() =>
                    router.push(`/flow-splitters/${chainId}/${poolId}/admin`)
                  }
                >
                  <InfoTooltip
                    position={{ top: true }}
                    target={
                      <Image width={48} src="/tune.svg" alt="Configuration" />
                    }
                    content={<p className="m-0 p-2">Configuration</p>}
                  />
                </Button>
              </Stack>
            </h1>
            <Stack direction="horizontal" gap={1} className="mb-10 fs-lg">
              Distributing{" "}
              {!!poolToken.icon && (
                <Image src={poolToken.icon} alt="" width={18} height={18} />
              )}
              {superfluidQueryRes?.token.symbol} on
              <Image src={network.icon} alt="" width={18} height={18} />
              {network.name}
              <Button
                variant="transparent"
                className="d-flex align-items-center p-0 border-0"
                onClick={() => {
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== chainId
                      ? switchChain({ chainId })
                      : addToWallet({
                          address: pool.token,
                          symbol: superfluidQueryRes?.token.symbol,
                          decimals: 18,
                          image: poolToken?.icon ?? "",
                        });
                }}
              >
                <InfoTooltip
                  position={{ top: true }}
                  target={<Image width={24} src="/wallet.svg" alt="wallet" />}
                  content={<p className="m-0 p-2">Add to Wallet</p>}
                />
              </Button>
            </Stack>
            <PoolGraph
              pool={superfluidQueryRes?.pool}
              chainId={chainId}
              ensByAddress={ensByAddress}
            />
            <Button
              className="w-100 rounded-4 mt-5 py-4 fs-5 fw-semi-bold"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== chainId
                    ? switchChain({ chainId })
                    : setShowOpenFlow(true);
              }}
            >
              Open Flow
            </Button>
            <Button
              variant="secondary"
              className="w-100 rounded-4 mt-5 mb-8 py-4 fs-5 fw-semi-bold"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== chainId
                    ? switchChain({ chainId })
                    : setShowInstantDistribution(true);
              }}
            >
              Send Distribution
            </Button>
            {superfluidQueryRes?.pool && pool && (
              <ActivityFeed
                poolSymbol={pool.symbol}
                poolAddress={pool.poolAddress}
                network={network}
                token={poolToken}
                poolCreatedEvent={superfluidQueryRes?.pool.poolCreatedEvent}
                poolAdminAddedEvents={pool.poolAdminAddedEvents}
                poolAdminRemovedEvents={pool.poolAdminRemovedEvents}
                flowDistributionUpdatedEvents={
                  superfluidQueryRes?.pool.flowDistributionUpdatedEvents
                }
                instantDistributionUpdatedEvents={
                  superfluidQueryRes?.pool.instantDistributionUpdatedEvents
                }
                memberUnitsUpdatedEvents={
                  superfluidQueryRes?.pool.memberUnitsUpdatedEvents
                }
                ensByAddress={ensByAddress}
              />
            )}
          </>
        )}
      </Stack>
      {showOpenFlow && (
        <OpenFlow
          show={showOpenFlow}
          network={network!}
          token={poolToken}
          pool={superfluidQueryRes?.pool}
          handleClose={() => setShowOpenFlow(false)}
        />
      )}
      {showInstantDistribution && (
        <InstantDistribution
          show={showInstantDistribution}
          network={network!}
          token={poolToken}
          pool={superfluidQueryRes?.pool}
          handleClose={() => setShowInstantDistribution(false)}
        />
      )}
      <Modal
        show={showConnectionModal}
        centered
        onHide={() => setShowConnectionModal(false)}
      >
        <Modal.Header closeButton className="align-items-start border-0 pt-3">
          <Modal.Title className="fs-5 fw-bold">
            You're a recipient in this Flow Splitter but haven't connected your
            shares.
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          Do you want to do that now, so your{" "}
          <Link href="https://app.superfluid.finance/" target="_blank">
            Super Token balance
          </Link>{" "}
          is reflected in real time?
        </Modal.Body>
        <Modal.Footer className="border-0">
          <PoolConnectionButton
            network={network}
            poolAddress={pool?.poolAddress}
            isConnected={!shouldConnect}
          />
        </Modal.Footer>
      </Modal>
    </>
  );
}
