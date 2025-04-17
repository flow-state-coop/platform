"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address } from "viem";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import { createVerifiedFetch } from "@helia/verified-fetch";
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
import { truncateStr } from "@/lib/utils";
import { IPFS_GATEWAYS } from "@/lib/constants";

type FlowCouncilsProps = {
  defaultNetwork: Network;
};

type Council = {
  id: string;
  distributionToken: string;
  isManager: boolean;
  isGrantee: boolean;
  pool: string;
  isConnected: boolean;
  units: bigint;
  metadata: { name: string; description: string };
};

const FLOW_COUNCIL_MANAGER_QUERY = gql`
  query FlowCouncilManagerQuery($address: String!) {
    councils(where: { councilManagers_: { account: $address } }) {
      id
      distributionToken
      pool
      metadata
    }
  }
`;

const FLOW_COUNCIL_MEMBER_QUERY = gql`
  query FlowCouncilMemberQuery($address: String!) {
    councils(where: { councilMembers_: { account: $address } }) {
      id
      distributionToken
      pool
      metadata
    }
  }
`;

const FLOW_COUNCIL_GRANTEE_QUERY = gql`
  query FlowCouncilGranteeQuery($address: String!) {
    councils(where: { grantees_: { account: $address } }) {
      id
      distributionToken
      pool
      metadata
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

export default function FlowCouncils(props: FlowCouncilsProps) {
  const { defaultNetwork } = props;

  const [selectedNetwork, setSelectedNetwork] =
    useState<Network>(defaultNetwork);
  const [councils, setCouncils] = useState<Council[]>([]);

  const router = useRouter();
  const { data: walletClient } = useWalletClient();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const {
    data: councilsManagerQueryRes,
    loading: councilsManagerQueryLoading,
  } = useQuery(FLOW_COUNCIL_MANAGER_QUERY, {
    client: getApolloClient("flowCouncil", selectedNetwork.id),
    variables: {
      address: address?.toLowerCase(),
    },
    pollInterval: 10000,
    skip: !address,
  });
  const { data: councilsMemberQueryRes } = useQuery(FLOW_COUNCIL_MEMBER_QUERY, {
    client: getApolloClient("flowCouncil", selectedNetwork.id),
    variables: {
      address: address?.toLowerCase(),
    },
    pollInterval: 10000,
    skip: !address,
  });
  const { data: councilsGranteeQueryRes } = useQuery(
    FLOW_COUNCIL_GRANTEE_QUERY,
    {
      client: getApolloClient("flowCouncil", selectedNetwork.id),
      variables: {
        address: address?.toLowerCase(),
      },
      pollInterval: 10000,
      skip: !address,
    },
  );
  const { data: superfluidQueryRes, loading: superfluidQueryLoading } =
    useQuery(SF_POOL_MEMBERSHIPS_QUERY, {
      client: getApolloClient("superfluid", selectedNetwork.id),
      variables: { address: address?.toLowerCase() },
      pollInterval: 10000,
      skip: !address,
    });

  const fetchMetadata = useCallback(async (council: Council) => {
    const verifiedFetch = await createVerifiedFetch({
      gateways: IPFS_GATEWAYS,
    });

    try {
      const metadataRes = await verifiedFetch(`ipfs://${council.metadata}`);
      const metadata = await metadataRes.json();

      return metadata;
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !councilsManagerQueryRes ||
        !councilsMemberQueryRes ||
        !councilsGranteeQueryRes ||
        !superfluidQueryRes
      ) {
        return;
      }

      const councils: Council[] = [];
      const sfPoolMemberships = superfluidQueryRes?.account?.poolMemberships;

      const buildCouncil = async (council: Council) => {
        const poolMembership = sfPoolMemberships.find(
          (membership: { pool: { id: string } }) =>
            membership.pool.id === council?.pool,
        );
        const metadata = await fetchMetadata(council);

        councils.push({
          id: council.id,
          distributionToken: council.distributionToken,
          isManager: !!councilsManagerQueryRes.councils.find(
            (c: { id: string }) => c.id === council.id,
          ),
          isGrantee: !!councilsGranteeQueryRes.councils.find(
            (c: { id: string }) => c.id === council.id,
          ),
          pool: council.pool,
          isConnected: poolMembership?.isConnected ?? false,
          units: BigInt(poolMembership?.units ?? 0),
          metadata,
        });
      };

      for (const councilManger of councilsManagerQueryRes.councils) {
        await buildCouncil(councilManger);
      }

      for (const councilMember of councilsMemberQueryRes.councils) {
        if (
          councilsManagerQueryRes?.councils
            .map((council: { id: string }) => council.id)
            .includes(councilMember.id)
        ) {
          continue;
        }

        await buildCouncil(councilMember);
      }

      for (const councilGrantee of councilsGranteeQueryRes.councils) {
        if (
          councilsManagerQueryRes?.councils
            .map((council: { id: string }) => council.id)
            .includes(councilGrantee.id) ||
          councilsMemberQueryRes?.councils
            .map((council: { id: string }) => council.id)
            .includes(councilGrantee.id)
        ) {
          continue;
        }

        await buildCouncil(councilGrantee);
      }

      setCouncils(councils);
    })();
  }, [
    address,
    councilsManagerQueryRes,
    councilsMemberQueryRes,
    councilsGranteeQueryRes,
    superfluidQueryRes,
    fetchMetadata,
  ]);

  const addToWallet = (token: Token) => {
    walletClient?.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: token.address,
          symbol: (token.name ? token.name : void 0) as string,
          decimals: 18,
          image: token.icon,
        },
      },
    });
  };

  const CouncilCard = ({
    council,
    token,
  }: {
    council: Council;
    token?: Token;
  }) => {
    const [nameRef, { clampedText }] = useClampText({
      text: council.metadata.name,
      ellipsis: "...",
      lines: 3,
    });

    return (
      <Card
        className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 shadow"
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
        <Card.Body className="h-100">
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
                {token?.name ?? truncateStr(council.distributionToken, 14)}
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
                          address: council.distributionToken as Address,
                          name: "",
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
        </Card.Body>
        <Card.Footer className="d-flex flex-column justify-content-end gap-1 w-100 h-25 bg-transparent border-0">
          {council.isManager && (
            <Button
              variant="primary"
              className="w-100"
              onClick={() =>
                router.push(
                  `/flow-councils/membership/?chainId=${selectedNetwork.id}&councilId=${council.id}`,
                )
              }
            >
              Edit
            </Button>
          )}
          {council.isGrantee && !council.isConnected ? (
            <PoolConnectionButton
              network={selectedNetwork}
              poolAddress={council.pool}
              isConnected={council.isConnected}
            />
          ) : (
            <Button
              variant="secondary"
              className="w-100"
              onClick={() =>
                router.push(
                  `/flow-councils/${selectedNetwork.id}/${council.id}`,
                )
              }
            >
              View
            </Button>
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
      {councilsManagerQueryLoading || superfluidQueryLoading ? (
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
            <h1 className="m-0">Flow Councils</h1>
            <InfoTooltip
              position={{ bottom: isMobile }}
              target={<Image src="/info.svg" alt="" width={18} height={18} />}
              content={<>Flow Councils</>}
            />
          </Stack>
          <h2 className="fs-5">
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
              className="d-flex flex-col justify-content-center align-items-center border-2 rounded-4 fs-4 cursor-pointer shadow"
              style={{ height: 400 }}
              onClick={() => {
                if (address) {
                  router.push(
                    `/flow-councils/launch/?chainId=${selectedNetwork.id}`,
                  );
                } else if (openConnectModal) {
                  openConnectModal();
                }
              }}
            >
              <Image src="/add.svg" alt="add" width={64} />
              <Card.Text className="d-inline-block m-0 overflow-hidden fs-2 text-center word-wrap">
                Create <br />
                Flow Council
              </Card.Text>
            </Card>
            {councils.map((council, i) => {
              const token = selectedNetwork.tokens.find(
                (token) =>
                  token.address.toLowerCase() === council.distributionToken,
              );

              return <CouncilCard key={i} council={council} token={token} />;
            })}
          </div>
        </Stack>
      )}
    </Container>
  );
}
