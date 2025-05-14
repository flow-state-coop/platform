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
import ActivityFeed from "./components/ActivityFeed";
import PoolGraph from "./components/PoolGraph";
import ProjectDetails from "./components/ProjectDetails";
import OpenFlow from "./components/OpenFlow";
import DonateOnce from "./components/DonateOnce";
import { getApolloClient } from "@/lib/apollo";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { flowStateFlowSplitters } from "./lib/flowSplittersTable";
import { networks } from "@/lib/networks";
import { FLOW_STATE_RECEIVER } from "@/lib/constants";

type CoreProps = {
  chainId: number;
};

const CORE_POOL_QUERY = gql`
  query CorePoolQuery($poolId: String!) {
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
        orderDirection: asc
      ) {
        address
        timestamp
        transactionHash
      }
      poolAdminAddedEvents(first: 25, orderBy: timestamp, orderDirection: asc) {
        address
        timestamp
        transactionHash
      }
    }
  }
`;

const SUPERFLUID_QUERY = gql`
  query SuperfluidQuery(
    $token: String!
    $flowStateSafe: String!
    $gdaPool: String!
  ) {
    token(id: $token) {
      id
      symbol
    }
    account(id: $flowStateSafe) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
      }
    }
    flowUpdatedEvents(
      first: 25
      orderBy: timestamp
      orderDirection: asc
      where: { receiver: $flowStateSafe }
    ) {
      flowRate
      oldFlowRate
      receiver
      sender
      timestamp
      transactionHash
    }
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

export default function Core(props: CoreProps) {
  const { chainId } = props;

  const [showProjectDetails, setShowProjectDetails] = useState(false);
  const [showOpenFlow, setShowOpenFlow] = useState(false);
  const [showDonateOnce, setShowDonateOnce] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [ensByAddress, setEnsByAddress] = useState<{
    [key: Address]: { name: string | null; avatar: string | null };
  } | null>(null);

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];
  const flowSplitter = flowStateFlowSplitters[network.id]["ETHx"];

  const { isMobile } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { address, chain: connectedChain } = useAccount();
  const {
    data: flowSplitterPoolQueryRes,
    loading: flowSplitterPoolQueryLoading,
  } = useQuery(CORE_POOL_QUERY, {
    client: getApolloClient("flowSplitter", chainId),
    variables: {
      poolId: flowSplitter.id,
      address: address?.toLowerCase() ?? "",
    },
    pollInterval: 10000,
  });
  const pool = flowSplitterPoolQueryRes?.pools[0];
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SUPERFLUID_QUERY, {
      client: getApolloClient("superfluid", chainId),
      variables: {
        token: pool?.token,
        flowStateSafe: FLOW_STATE_RECEIVER,
        gdaPool: pool?.poolAddress,
      },
      pollInterval: 10000,
      skip: !pool,
    });
  const postHog = usePostHog();

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

      for (const flowUpdatedEvent of superfluidQueryRes.flowUpdatedEvents) {
        addresses.push(flowUpdatedEvent.sender);
      }

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
      {flowSplitterPoolQueryLoading ||
      superfluidQueryLoading ||
      !ensByAddress ? (
        <span className="position-absolute top-50 start-50 translate-middle">
          <Spinner />
        </span>
      ) : !network ? (
        <p className="w-100 mt-5 fs-4 text-center">Pool Not Found</p>
      ) : (
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          className="align-items-start flex-grow-1"
        >
          <div
            className="px-4 mb-5"
            style={{ width: isMobile ? "100%" : "75%" }}
          >
            {ensByAddress && (
              <PoolGraph
                flowStateSafeInflowRate={
                  superfluidQueryRes?.account?.accountTokenSnapshots[0]
                    .totalInflowRate ?? "0"
                }
                pool={superfluidQueryRes?.pool}
                chainId={chainId}
                ensByAddress={ensByAddress}
                showProjectDetails={() => setShowProjectDetails(true)}
              />
            )}
            {isMobile && (
              <Button
                variant="primary"
                className="w-100 mt-3"
                onClick={() => setShowOpenFlow(true)}
              >
                Open Flow
              </Button>
            )}
            {isMobile && (
              <Button
                variant="secondary"
                className="w-100 mt-3"
                onClick={() => setShowDonateOnce(true)}
              >
                Donate Once
              </Button>
            )}
            {superfluidQueryRes?.pool && pool && ensByAddress && (
              <ActivityFeed
                poolSymbol={pool.symbol}
                poolAddress={pool.poolAddress}
                network={network}
                token={poolToken}
                flowUpdatedEvents={superfluidQueryRes?.flowUpdatedEvents}
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
          </div>
          {isMobile && showProjectDetails && (
            <Offcanvas
              show={showProjectDetails}
              placement="bottom"
              className="h-100"
              onHide={() => setShowProjectDetails(false)}
            >
              <Offcanvas.Header closeButton className="pb-0" />
              <Offcanvas.Body>
                <ProjectDetails />
              </Offcanvas.Body>
            </Offcanvas>
          )}
          {isMobile ? (
            <Offcanvas
              show={showOpenFlow || showDonateOnce}
              placement="bottom"
              className="h-100"
              onHide={() =>
                showOpenFlow ? setShowOpenFlow(false) : setShowDonateOnce(false)
              }
            >
              <Offcanvas.Header closeButton className="pb-0" />
              <Offcanvas.Body>
                {showOpenFlow ? (
                  <OpenFlow
                    network={network!}
                    pool={superfluidQueryRes?.pool}
                    token={poolToken}
                  />
                ) : (
                  <DonateOnce
                    network={network!}
                    pool={superfluidQueryRes?.pool}
                    token={poolToken}
                  />
                )}
              </Offcanvas.Body>
            </Offcanvas>
          ) : (
            <div
              className="w-25 h-100 border-start border-2"
              style={{ boxShadow: "-0.5rem 0px 0.5rem 0px rgba(0,0,0,0.2)" }}
            >
              <Stack direction="vertical" className="mt-2 p-2">
                {showOpenFlow ? (
                  <OpenFlow
                    network={network!}
                    token={poolToken}
                    pool={superfluidQueryRes?.pool}
                    handleClose={() => setShowOpenFlow(false)}
                  />
                ) : showDonateOnce ? (
                  <DonateOnce
                    network={network!}
                    token={poolToken}
                    pool={superfluidQueryRes?.pool}
                    handleClose={() => setShowDonateOnce(false)}
                  />
                ) : (
                  <>
                    <ProjectDetails />
                    <Button
                      className="w-100 mt-4 py-2 fs-5"
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
                      className="w-100 mt-3 py-2 fs-5"
                      onClick={() => {
                        !address && openConnectModal
                          ? openConnectModal()
                          : connectedChain?.id !== network.id
                            ? switchChain({ chainId: network.id })
                            : setShowDonateOnce(true);
                      }}
                    >
                      Donate Once
                    </Button>
                  </>
                )}
              </Stack>
            </div>
          )}
        </Stack>
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
