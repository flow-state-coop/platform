"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address } from "viem";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import { useClampText } from "use-clamp-text";
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
import { truncateStr } from "@/lib/utils";

import { type FlowCouncilListing } from "./types/flowCouncil";
import { fetchRoundMetadata } from "./lib/fetchRoundMetadata";

type FlowCouncilsProps = {
  defaultNetwork: Network;
};

function flowCouncilsByRoleQuery(role: string) {
  return gql`
    query FlowCouncilByRoleQuery($address: String!) {
      flowCouncils(
        first: 1000
        orderBy: createdAtTimestamp
        orderDirection: desc
        where: { ${role}_: { account: $address } }
      ) {
        id
        superToken
        distributionPool
        metadata
      }
    }
  `;
}

const FLOW_COUNCIL_MANAGER_QUERY = flowCouncilsByRoleQuery(
  "flowCouncilManagers",
);
const FLOW_COUNCIL_VOTER_QUERY = flowCouncilsByRoleQuery("voters");
const FLOW_COUNCIL_RECIPIENT_QUERY = flowCouncilsByRoleQuery("recipients");

const SF_POOL_MEMBERSHIPS_QUERY = gql`
  query SFPoolMembershipsQuery($address: String) {
    account(id: $address) {
      id
      poolMemberships(
        first: 1000
        orderBy: createdAtTimestamp
        orderDirection: desc
      ) {
        id
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

export default function FlowCouncils(props: FlowCouncilsProps) {
  const { defaultNetwork } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [flowCouncils, setFlowCouncils] = useState<FlowCouncilListing[]>([]);

  const router = useRouter();
  const { data: walletClient } = useWalletClient();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const supportedNetworkConnection = networks.find(
    (network) => network.id === connectedChain?.id && network.label === "celo",
  );
  const networkId = supportedNetworkConnection
    ? connectedChain?.id
    : selectedNetwork.id;
  const queryOptions = {
    variables: { address: address?.toLowerCase() },
    pollInterval: 10000,
    skip: !address,
  };
  const {
    data: flowCouncilsManagerQueryRes,
    loading: flowCouncilsManagerQueryLoading,
  } = useQuery(FLOW_COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", networkId),
    ...queryOptions,
  });
  const { data: flowCouncilsVoterQueryRes } = useQuery(
    FLOW_COUNCIL_VOTER_QUERY,
    { client: getApolloClient("flowCouncil", networkId), ...queryOptions },
  );
  const { data: flowCouncilsRecipientQueryRes } = useQuery(
    FLOW_COUNCIL_RECIPIENT_QUERY,
    { client: getApolloClient("flowCouncil", networkId), ...queryOptions },
  );
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SF_POOL_MEMBERSHIPS_QUERY, {
      client: getApolloClient("superfluid", networkId),
      ...queryOptions,
    });

  useEffect(() => {
    if (supportedNetworkConnection) {
      setSelectedNetwork(supportedNetworkConnection);
    }
  }, [supportedNetworkConnection]);

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !flowCouncilsManagerQueryRes ||
        !flowCouncilsVoterQueryRes ||
        !flowCouncilsRecipientQueryRes ||
        !superfluidQueryRes
      ) {
        return;
      }

      const councils: FlowCouncilListing[] = [];
      const sfPoolMemberships = superfluidQueryRes?.account?.poolMemberships;

      const buildFlowCouncil = async (
        flowCouncil: FlowCouncilListing & { metadata: string },
      ) => {
        const poolMembership = sfPoolMemberships?.find(
          (membership: { pool: { id: string } }) =>
            membership.pool.id === flowCouncil?.distributionPool,
        );

        const fetched = await fetchRoundMetadata(
          selectedNetwork.id,
          flowCouncil.id,
        );
        const roundMetadata = {
          name: fetched.name,
          description: fetched.description || "N/A",
        };

        councils.push({
          id: flowCouncil.id,
          superToken: flowCouncil.superToken,
          isManager: managerIds.has(flowCouncil.id),
          isRecipient: recipientIds.has(flowCouncil.id),
          distributionPool: flowCouncil.distributionPool,
          isConnected: poolMembership?.isConnected ?? false,
          units: BigInt(poolMembership?.units ?? 0),
          metadata: roundMetadata,
        });
      };

      const managerIds = new Set(
        flowCouncilsManagerQueryRes.flowCouncils.map(
          (c: { id: string }) => c.id,
        ),
      );
      const recipientIds = new Set(
        flowCouncilsRecipientQueryRes.flowCouncils.map(
          (c: { id: string }) => c.id,
        ),
      );
      const seenIds = new Set<string>();
      const promises = [];

      for (const council of flowCouncilsManagerQueryRes.flowCouncils) {
        seenIds.add(council.id);
        promises.push(buildFlowCouncil(council));
      }

      for (const council of flowCouncilsVoterQueryRes.flowCouncils) {
        if (seenIds.has(council.id)) continue;
        seenIds.add(council.id);
        promises.push(buildFlowCouncil(council));
      }

      for (const council of flowCouncilsRecipientQueryRes.flowCouncils) {
        if (seenIds.has(council.id)) continue;
        seenIds.add(council.id);
        promises.push(buildFlowCouncil(council));
      }

      await Promise.all(promises);

      setFlowCouncils(councils);
    })();
  }, [
    selectedNetwork,
    address,
    flowCouncilsManagerQueryRes,
    flowCouncilsVoterQueryRes,
    flowCouncilsRecipientQueryRes,
    superfluidQueryRes,
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

  const FlowCouncilCard = ({
    flowCouncil,
    token,
  }: {
    flowCouncil: FlowCouncilListing;
    token?: Token;
  }) => {
    const [nameRef, { clampedText }] = useClampText({
      text: flowCouncil.metadata?.name,
      ellipsis: "...",
      lines: 3,
    });

    return (
      <Card
        className="d-flex flex-col justify-content-center align-items-center border-4 border-dark rounded-4 p-4 shadow cursor-pointer"
        style={{ height: 400 }}
        onClick={() =>
          router.push(`/flow-councils/${selectedNetwork.id}/${flowCouncil.id}`)
        }
      >
        <Card.Header className="h-25 bg-white border-0 rounded-4">
          <Card.Title
            ref={nameRef as React.RefObject<HTMLParagraphElement>}
            className="fs-5 fw-semi-bold text-center"
          >
            {clampedText}
          </Card.Title>
        </Card.Header>
        <Card.Body className="h-100">
          <Stack
            direction="horizontal"
            gap={1}
            className="justify-content-center mb-4"
          >
            <Card.Link
              href={selectedNetwork.superfluidDashboard}
              target="_blank"
              className="d-flex gap-2 align-items-center text-decoration-none fw-semi-bold"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              {token && (
                <Image src={token.icon} alt="" width={22} height={22} />
              )}
              <Card.Text className="text-decoration-underline">
                {token?.symbol ?? truncateStr(flowCouncil.superToken, 14)}
              </Card.Text>
            </Card.Link>
            <Button
              variant="transparent"
              className="p-0"
              onClick={(e) => {
                e.stopPropagation();
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== selectedNetwork.id
                    ? switchChain({ chainId: selectedNetwork.id })
                    : addToWallet(
                        token ?? {
                          address: flowCouncil.superToken as Address,
                          symbol: "",
                          icon: "",
                        },
                      );
              }}
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
                content={<p className="m-0 p-2">Add to Wallet</p>}
              />
            </Button>
          </Stack>
        </Card.Body>
        <Card.Footer className="d-flex flex-column justify-content-end gap-1 w-100 h-25 bg-transparent border-0">
          {flowCouncil.isManager && (
            <Button
              variant="primary"
              className="w-100 py-4 rounded-4 fw-semi-bold"
              onClick={(e) => {
                e.stopPropagation();
                router.push(
                  `/flow-councils/permissions/${selectedNetwork.id}/${flowCouncil.id}`,
                );
              }}
            >
              Edit
            </Button>
          )}
          {flowCouncil.isRecipient && !flowCouncil.isConnected ? (
            <div onClick={(e) => e.stopPropagation()}>
              <PoolConnectionButton
                network={selectedNetwork}
                poolAddress={flowCouncil.distributionPool}
                isConnected={flowCouncil.isConnected}
              />
            </div>
          ) : (
            <Button
              variant="secondary"
              className="w-100 py-4 rounded-4 fw-semi-bold"
              onClick={(e) => {
                e.stopPropagation();
                router.push(
                  `/flow-councils/${selectedNetwork.id}/${flowCouncil.id}`,
                );
              }}
            >
              View
            </Button>
          )}
        </Card.Footer>
      </Card>
    );
  };

  return (
    <Stack
      direction="vertical"
      gap={6}
      className="px-2 pt-10 pb-30 px-lg-30 px-xxl-52"
    >
      {flowCouncilsManagerQueryLoading || superfluidQueryLoading ? (
        <span className="position-absolute top-50 start-50 translate-middle">
          <Spinner className="m-auto" />
        </span>
      ) : (
        <Stack direction="vertical" gap={3}>
          <Stack
            direction="horizontal"
            gap={1}
            className="align-items-start mt-3"
          >
            <h1 className="m-0 fs-3 fw-semi-bold">Flow Councils</h1>
          </Stack>
          <h2 className="fs-lg">
            Dynamically allocate token streams to unlimited recipients based on
            votes from a configurable membership.
            <br />
            <Card.Link
              href="https://docs.flowstate.network/platform/flow-councils/"
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
          <h3 className="mt-2 fs-lg">
            {truncateStr(address ?? "", isMobile ? 20 : 42)}
          </h3>
          <Dropdown className="mt-8">
            <Dropdown.Toggle
              variant="transparent"
              className={`d-flex justify-content-between align-items-center border border-4 border-dark py-4 rounded-4 fw-semi-bold ${isMobile ? "" : "w-20"}`}
            >
              {selectedNetwork.name}
            </Dropdown.Toggle>
            <Dropdown.Menu className="border-4 border-dark lh-lg">
              {networks
                .filter((network) => network.label === "celo")
                .map((network, i) => (
                  <Dropdown.Item
                    key={i}
                    className="fw-semi-bold"
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
            className="pb-5 mt-2"
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
              className="d-flex flex-col justify-content-center align-items-center border-4 border-dark rounded-4 fs-4 cursor-pointer shadow"
              style={{ height: 400 }}
              onClick={() => {
                if (address) {
                  router.push("/flow-councils/launch");
                } else if (openConnectModal) {
                  openConnectModal();
                }
              }}
            >
              <Image src="/add.svg" alt="add" width={64} />
              <Card.Text className="d-inline-block m-0 overflow-hidden fs-6 fw-semi-bold text-center word-wrap">
                Create <br />
                Flow Council
              </Card.Text>
            </Card>
            {flowCouncils.map((flowCouncil, i) => {
              const token = selectedNetwork.tokens.find(
                (token) =>
                  token.address.toLowerCase() === flowCouncil.superToken,
              );

              return (
                <FlowCouncilCard
                  key={i}
                  flowCouncil={flowCouncil}
                  token={token}
                />
              );
            })}
          </div>
        </Stack>
      )}
    </Stack>
  );
}
