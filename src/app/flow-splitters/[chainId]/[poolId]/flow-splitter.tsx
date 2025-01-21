"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { usePostHog } from "posthog-js/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import Modal from "react-bootstrap/Modal";
import InfoTooltip from "@/components/InfoTooltip";
import PoolConnectionButton from "@/components/PoolConnectionButton";
import PoolGraph from "../../components/PoolGraph";
import OpenFlow from "@/app/flow-splitters/components/OpenFlow";
import { getApolloClient } from "@/lib/apollo";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { networks } from "@/lib/networks";
import { truncateStr } from "@/lib/utils";

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
      poolAdmins {
        address
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
      updatedAtTimestamp
      poolMembers {
        account {
          id
        }
        units
        isConnected
      }
      poolDistributors {
        account {
          id
        }
        flowRate
      }
      token {
        id
        symbol
      }
    }
  }
`;

export default function FlowSplitter(props: FlowSplitterProps) {
  const { poolId, chainId } = props;

  const [showTransactionPanel, setShowTransactionPanel] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const router = useRouter();
  const { isMobile, isTablet, isSmallScreen, isMediumScreen } = useMediaQuery();
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
  const poolAdmins = flowSplitterPoolQueryRes?.pools[0]?.poolAdmins;
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
  );
  const poolMember = superfluidQueryRes?.pool?.poolMembers.find(
    (member: { account: { id: string } }) =>
      member.account.id === address?.toLowerCase(),
  );
  const shouldConnect = !!poolMember && !poolMember.isConnected;

  useEffect(() => setShowConnectionModal(shouldConnect), [shouldConnect]);

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
      <Container
        className="mx-auto p-0 px-4 mb-5"
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
        {flowSplitterPoolQueryLoading || superfluidQueryLoading ? (
          <span className="position-absolute top-50 start-50 translate-middle">
            <Spinner />
          </span>
        ) : !network ? (
          <p className="w-100 mt-5 fs-4 text-center">Pool Not Found</p>
        ) : (
          <>
            <h1 className="d-flex flex-column flex-sm-row align-items-sm-center overflow-hidden gap-sm-1 mt-5 mb-1">
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
                <span className="d-none d-sm-inline-block">)</span>
                {poolAdmins.find(
                  (admin: { address: string }) =>
                    admin.address === address?.toLowerCase(),
                ) && (
                  <Button
                    variant="transparent"
                    className="mt-2 p-0 border-0"
                    onClick={() =>
                      router.push(`/flow-splitters/${chainId}/${poolId}/admin`)
                    }
                  >
                    <InfoTooltip
                      position={{ top: true }}
                      target={<Image width={32} src="/edit.svg" alt="Edit" />}
                      content={<>Edit</>}
                    />
                  </Button>
                )}
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
                    target={<Image width={32} src="/wallet.svg" alt="wallet" />}
                    content={<>Add to Wallet</>}
                  />
                </Button>
              </Stack>
            </h1>
            <Stack direction="horizontal" gap={1} className="mb-5 fs-6">
              Distributing{" "}
              {poolToken && (
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
                  content={<>Add to Wallet</>}
                />
              </Button>
            </Stack>
            <PoolGraph pool={superfluidQueryRes?.pool} chainId={chainId} />
            <Button
              className="w-100 mt-5 py-2 fs-5"
              onClick={() => {
                !address && openConnectModal
                  ? openConnectModal()
                  : connectedChain?.id !== chainId
                    ? switchChain({ chainId })
                    : setShowTransactionPanel(true);
              }}
            >
              Open Flow
            </Button>
          </>
        )}
      </Container>
      {showTransactionPanel && (
        <OpenFlow
          show={showTransactionPanel}
          network={network!}
          token={
            poolToken ?? {
              address: pool?.token ?? "",
              name: superfluidQueryRes?.token.symbol ?? "N/A",
              icon: "",
            }
          }
          pool={superfluidQueryRes?.pool}
          handleClose={() => setShowTransactionPanel(false)}
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
          Do you want to do that now, so your supertoken balance is reflected in
          real time?
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
