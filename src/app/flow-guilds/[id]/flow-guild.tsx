"use client";

import { useState, useEffect } from "react";
import { Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Offcanvas from "react-bootstrap/Offcanvas";
import Spinner from "react-bootstrap/Spinner";
import Modal from "react-bootstrap/Modal";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import ActivityFeed from "../components/ActivityFeed";
import Graph from "../components/Graph";
import ProjectDetails from "../components/ProjectDetails";
import OpenFlow from "../components/OpenFlow";
import DonateOnce from "../components/DonateOnce";
import { Token } from "@/types/token";
import { getApolloClient } from "@/lib/apollo";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { FlowGuildConfig } from "../lib/flowGuildConfig";
import { networks } from "@/lib/networks";
import { IPFS_GATEWAYS } from "@/lib/constants";

type FlowGuildProps = {
  flowGuildConfig: FlowGuildConfig;
  chainId: number;
};

const FLOW_GUILD_POOL_QUERY = gql`
  query FlowGuildPoolQuery($poolId: String!) {
    pools(where: { id: $poolId }) {
      poolAddress
      name
      symbol
      token
      poolAdmins {
        address
      }
      poolAdminRemovedEvents(
        first: 25
        orderBy: timestamp
        orderDirection: desc
      ) {
        address
        timestamp
        transactionHash
      }
      poolAdminAddedEvents(
        first: 25
        orderBy: timestamp
        orderDirection: desc
      ) {
        address
        timestamp
        transactionHash
      }
    }
  }
`;

const SAFE_QUERY = gql`
  query SafeQuery($token: String!, $safe: String!) {
    token(id: $token) {
      id
      symbol
    }
    account(id: $safe) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
        activeIncomingStreamCount
      }
      receivedTransferEvents(
        first: 25
        orderBy: timestamp
        orderDirection: desc
        where: { token: $token }
      ) {
        from {
          id
        }
        value
        timestamp
        transactionHash
      }
    }
    flowUpdatedEvents(
      first: 25
      orderBy: timestamp
      orderDirection: desc
      where: { receiver: $safe, token: $token }
    ) {
      flowRate
      oldFlowRate
      receiver
      sender
      timestamp
      transactionHash
    }
  }
`;

const GDA_POOL_QUERY = gql`
  query GDAPoolQuery($gdaPool: String!) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalUnits
      totalAmountFlowedDistributedUntilUpdatedAt
      totalAmountInstantlyDistributedUntilUpdatedAt
      updatedAtTimestamp
      poolMembers {
        account {
          id
        }
        units
        isConnected
      }
      poolDistributors(first: 25, where: { flowRate_not: "0" }) {
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
        first: 25
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
        first: 25
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
        first: 25
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

export default function FlowGuild(props: FlowGuildProps) {
  const { flowGuildConfig, chainId } = props;

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];

  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const [showOpenFlow, setShowOpenFlow] = useState(false);
  const [showDonateOnce, setShowDonateOnce] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token>(
    network.tokens.find(
      (token) => token.symbol === flowGuildConfig.defaultToken,
    ) ?? network.tokens[0],
  );
  const [ensByAddress, setEnsByAddress] = useState<{
    [key: Address]: { name: string | null; avatar: string | null };
  } | null>(null);

  const flowSplitter =
    flowGuildConfig.flowSplitters[network.id]?.[selectedToken.symbol];

  const { isMobile, isTablet } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { address, chain: connectedChain } = useAccount();
  const { data: flowSplitterPoolQueryRes } = useQuery(FLOW_GUILD_POOL_QUERY, {
    client: getApolloClient("flowSplitter", chainId),
    variables: {
      poolId: flowSplitter?.id,
      address: address?.toLowerCase() ?? "",
    },
    skip: !flowSplitter,
    pollInterval: 10000,
  });
  const pool = flowSplitterPoolQueryRes?.pools[0];
  const { data: safeQueryRes, loading: safeQueryLoading } = useQuery(
    SAFE_QUERY,
    {
      client: getApolloClient("superfluid", chainId),
      variables: {
        token: selectedToken.address.toLowerCase(),
        safe: flowGuildConfig.safe,
      },
      pollInterval: 10000,
    },
  );
  const { data: gdaPoolQueryRes, loading: gdaPoolQueryLoading } = useQuery(
    GDA_POOL_QUERY,
    {
      client: getApolloClient("superfluid", chainId),
      variables: {
        gdaPool: pool?.poolAddress,
      },
      pollInterval: 10000,
      skip: !pool,
    },
  );
  const postHog = usePostHog();

  const poolMember = gdaPoolQueryRes?.pool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

  useEffect(
    () =>
      setSelectedToken(
        network.tokens.find(
          (token) => token.symbol === flowGuildConfig.defaultToken,
        ) ?? network.tokens[0],
      ),
    [network, flowGuildConfig],
  );

  useEffect(() => {
    const ensByAddress: {
      [key: Address]: { name: string | null; avatar: string | null };
    } = {};
    (async () => {
      if (!safeQueryRes || (flowSplitter && !gdaPoolQueryRes)) {
        return;
      }

      const addresses = [];

      for (const flowUpdatedEvent of safeQueryRes.flowUpdatedEvents) {
        addresses.push(flowUpdatedEvent.sender);
      }

      if (safeQueryRes.account) {
        for (const receivedTransferEvent of safeQueryRes.account
          .receivedTransferEvents) {
          addresses.push(receivedTransferEvent.from.id);
        }
      }

      if (pool) {
        for (const poolAdminAddedEvent of pool.poolAdminAddedEvents) {
          addresses.push(poolAdminAddedEvent.address);
        }

        for (const poolAdminRemovedEvent of pool.poolAdminRemovedEvents) {
          addresses.push(poolAdminRemovedEvent.address);
        }
      }

      if (gdaPoolQueryRes) {
        for (const memberUnitsUpdatedEvent of gdaPoolQueryRes.pool
          .memberUnitsUpdatedEvents) {
          addresses.push(memberUnitsUpdatedEvent.poolMember.account.id);
        }

        for (const flowDistributionUpdatedEvent of gdaPoolQueryRes.pool
          .flowDistributionUpdatedEvents) {
          addresses.push(
            flowDistributionUpdatedEvent.poolDistributor.account.id,
          );
        }

        for (const instantDistributionUpdatedEvent of gdaPoolQueryRes.pool
          .instantDistributionUpdatedEvents) {
          addresses.push(
            instantDistributionUpdatedEvent.poolDistributor.account.id,
          );
        }
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
  }, [flowSplitter, pool, gdaPoolQueryRes, safeQueryRes]);

  useEffect(() => {
    if (connectedChain && connectedChain.id !== chainId) {
      switchChain({ chainId });
    }
  }, [chainId, connectedChain, switchChain]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  return (
    <>
      <Stack
        direction={isMobile || isTablet ? "vertical" : "horizontal"}
        className="align-items-start flex-grow-1 mb-30"
      >
        {(isMobile || isTablet) && showProjectDetails && (
          <Offcanvas
            show={showProjectDetails}
            placement="bottom"
            className="h-100"
            onHide={() => setShowProjectDetails(false)}
          >
            <Offcanvas.Header closeButton className="py-2" />
            <Offcanvas.Body>
              <ProjectDetails flowGuildConfig={flowGuildConfig} />
              <Button
                className="w-100 mt-4 py-4 fs-6 fw-semi-bold rounded-4"
                onClick={() => {
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== network.id
                      ? switchChain({ chainId: network.id })
                      : setShowOpenFlow(true);
                }}
              >
                Open Flow
              </Button>
              <Button
                variant="secondary"
                className="w-100 mt-4 py-4 fs-6 fw-semi-bold rounded-4"
                onClick={() =>
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== network.id
                      ? switchChain({ chainId: network.id })
                      : setShowDonateOnce(true)
                }
              >
                Donate Once
              </Button>
            </Offcanvas.Body>
          </Offcanvas>
        )}
        {isMobile || isTablet ? (
          <Offcanvas
            show={showOpenFlow || showDonateOnce}
            placement="bottom"
            className="h-100 px-1"
            onHide={() =>
              showOpenFlow ? setShowOpenFlow(false) : setShowDonateOnce(false)
            }
          >
            <Offcanvas.Header closeButton className="py-2" />
            <Offcanvas.Body>
              {showOpenFlow ? (
                <OpenFlow
                  flowGuildConfig={flowGuildConfig}
                  network={network!}
                  token={selectedToken}
                  selectToken={(token) => setSelectedToken(token)}
                />
              ) : (
                <DonateOnce
                  flowGuildConfig={flowGuildConfig}
                  network={network!}
                  token={selectedToken}
                  selectToken={(token: Token) => setSelectedToken(token)}
                  showOpenFlow={() => setShowOpenFlow(true)}
                  handleClose={() => setShowDonateOnce(false)}
                />
              )}
            </Offcanvas.Body>
          </Offcanvas>
        ) : (
          <div className="w-25 h-100">
            <Stack direction="vertical" className="mt-2 p-3">
              {showOpenFlow ? (
                <OpenFlow
                  flowGuildConfig={flowGuildConfig}
                  network={network!}
                  token={selectedToken}
                  selectToken={(token) => setSelectedToken(token)}
                  handleClose={() => setShowOpenFlow(false)}
                />
              ) : showDonateOnce ? (
                <DonateOnce
                  flowGuildConfig={flowGuildConfig}
                  network={network!}
                  token={selectedToken}
                  selectToken={(token: Token) => setSelectedToken(token)}
                  showOpenFlow={() => setShowOpenFlow(true)}
                  handleClose={() => setShowDonateOnce(false)}
                />
              ) : (
                <>
                  <ProjectDetails flowGuildConfig={flowGuildConfig} />
                  <Button
                    className="w-100 mt-4 py-4 fs-6 fw-semi-bold rounded-4"
                    onClick={() => {
                      !address && openConnectModal
                        ? openConnectModal()
                        : connectedChain?.id !== network.id
                          ? switchChain({ chainId: network.id })
                          : setShowOpenFlow(true);
                    }}
                  >
                    Open Flow
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-100 mt-3 py-4 fs-6 fw-semi-bold rounded-4"
                    onClick={() =>
                      !address && openConnectModal
                        ? openConnectModal()
                        : connectedChain?.id !== network.id
                          ? switchChain({ chainId: network.id })
                          : setShowDonateOnce(true)
                    }
                  >
                    Donate Once
                  </Button>
                </>
              )}
            </Stack>
          </div>
        )}
        <div
          className="h-100 px-4 mb-5"
          style={{ width: isMobile || isTablet ? "100%" : "75%" }}
        >
          {(!safeQueryRes || safeQueryLoading || gdaPoolQueryLoading) && (
            <span className="d-flex justify-content-center align-items-center w-100 h-100">
              <Spinner />
            </span>
          )}
          {safeQueryRes && !safeQueryLoading && !gdaPoolQueryLoading && (
            <Graph
              key={chainId}
              flowGuildConfig={flowGuildConfig}
              safeInflowRate={
                safeQueryRes?.account?.accountTokenSnapshots[0]
                  ?.totalInflowRate ?? "0"
              }
              totalDonors={
                safeQueryRes?.account?.accountTokenSnapshots[0]
                  ?.activeIncomingStreamCount ?? 0
              }
              token={selectedToken}
              pool={gdaPoolQueryRes?.pool}
              chainId={chainId}
              ensByAddress={ensByAddress}
              showProjectDetails={() => setShowProjectDetails(true)}
            />
          )}
          {(isMobile || isTablet) && (
            <>
              <Button
                variant="primary"
                className="w-100 mt-3 py-4 rounded-4 fs-6 fw-semi-bold"
                onClick={() =>
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== network.id
                      ? switchChain({ chainId: network.id })
                      : setShowOpenFlow(true)
                }
              >
                Open Flow
              </Button>
              <Button
                variant="secondary"
                className="w-100 mt-3 py-4 rounded-4 fs-6 fw-semi-bold"
                onClick={() =>
                  !address && openConnectModal
                    ? openConnectModal()
                    : connectedChain?.id !== network.id
                      ? switchChain({ chainId: network.id })
                      : setShowDonateOnce(true)
                }
              >
                Donate Once
              </Button>
            </>
          )}
          {safeQueryRes && !safeQueryLoading && !gdaPoolQueryLoading && (
            <ActivityFeed
              poolSymbol={pool?.symbol ?? ""}
              poolAddress={pool?.poolAddress ?? ""}
              network={network}
              token={selectedToken}
              flowUpdatedEvents={safeQueryRes?.flowUpdatedEvents}
              poolCreatedEvent={gdaPoolQueryRes?.pool.poolCreatedEvent}
              poolAdminAddedEvents={pool?.poolAdminAddedEvents ?? []}
              poolAdminRemovedEvents={pool?.poolAdminRemovedEvents ?? []}
              flowDistributionUpdatedEvents={
                gdaPoolQueryRes?.pool.flowDistributionUpdatedEvents ?? []
              }
              instantDistributionUpdatedEvents={
                gdaPoolQueryRes?.pool.instantDistributionUpdatedEvents ?? []
              }
              memberUnitsUpdatedEvents={
                gdaPoolQueryRes?.pool.memberUnitsUpdatedEvents ?? []
              }
              receivedTransferEvents={
                safeQueryRes.account?.receivedTransferEvents ?? []
              }
              ensByAddress={ensByAddress}
            />
          )}
        </div>
      </Stack>
      <Modal
        show={showConnectionModal}
        centered
        onHide={() => setShowConnectionModal(false)}
        contentClassName="p-4"
      >
        <Modal.Header closeButton className="align-items-start border-0">
          <Modal.Title className="fs-lg fw-semi-bold">
            You're a recipient in this Flow Splitter but haven't connected your
            shares.
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="mt-4 mb-2">
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
