"use client";

import { useState } from "react";
import Link from "next/link";
import { Address, parseEther, formatEther } from "viem";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Sidebar from "../components/Sidebar";
import useFlowingAmount from "@/hooks/flowingAmount";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { isNumber } from "@/lib/utils";
import { networks } from "@/lib/networks";
import { strategyAbi } from "@/lib/abi/strategy";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import { SECONDS_IN_MONTH, ZERO_ADDRESS } from "@/lib/constants";

type MatchingProps = {
  chainId: number | null;
  profileId: string | null;
  poolId: string | null;
};

const POOL_BY_ID_QUERY = gql`
  query PoolByIdQuery($poolId: String, $chainId: Int) {
    pools(
      filter: {
        chainId: { equalTo: $chainId }
        id: { equalTo: $poolId }
        tags: { contains: "allo" }
      }
    ) {
      strategyAddress
      matchingToken
    }
  }
`;

const SF_ACCOUNT_QUERY = gql`
  query SFAccountQuery($userAddress: String, $token: String) {
    account(id: $userAddress) {
      id
      accountTokenSnapshots(where: { token: $token }) {
        balanceUntilUpdatedAt
        updatedAtTimestamp
        totalNetFlowRate
        token {
          id
          isNativeAssetSuperToken
          underlyingAddress
        }
      }
    }
  }
`;

export default function Matching(props: MatchingProps) {
  const { chainId, profileId, poolId } = props;

  const [newFlowRate, setNewFlowRate] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const { isMobile, isTablet } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const network = networks.find((network) => network.id === Number(chainId));
  const publicClient = usePublicClient();
  const { data: flowStateQueryRes, loading } = useQuery(POOL_BY_ID_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      poolId,
      chainId,
    },
    skip: !poolId,
  });
  const matchingToken = flowStateQueryRes
    ? (flowStateQueryRes.pools[0].matchingToken as Address)
    : null;
  const { data: superfluidQueryRes } = useQuery(SF_ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", chainId ?? 10),
    variables: {
      userAddress: address?.toLowerCase() ?? "0x",
      token: matchingToken,
    },
    pollInterval: 10000,
  });

  const { data: gdaPool } = useReadContract({
    address: flowStateQueryRes?.pools[0].strategyAddress,
    abi: strategyAbi,
    functionName: "gdaPool",
  });
  const { data: currentFlowRate } = useReadContract({
    address: network?.gdaForwarder,
    abi: gdaForwarderAbi,
    functionName: "getFlowDistributionFlowRate",
    args: [matchingToken as Address, address as Address, gdaPool as Address],
    query: { refetchInterval: 5000, enabled: !!matchingToken },
  });
  const matchingTokenSymbol =
    network?.tokens.find(
      (token) => matchingToken === token.address.toLowerCase(),
    )?.symbol ?? "matching token";
  const isMatchingTokenPureSuperToken =
    !superfluidQueryRes?.account?.token?.isNativeAssetSuperToken &&
    superfluidQueryRes?.account?.token?.underlyingAddress === ZERO_ADDRESS;
  const matchingTokenBalance = useFlowingAmount(
    BigInt(
      superfluidQueryRes?.account?.accountTokenSnapshots[0]
        ?.balanceUntilUpdatedAt ?? 0,
    ),
    superfluidQueryRes?.account?.accountTokenSnapshots[0]?.updatedAtTimestamp ??
      0,
    BigInt(
      superfluidQueryRes?.account?.accountTokenSnapshots[0]?.totalNetFlowRate ??
        0,
    ),
  );

  const handleStreamUpdate = async () => {
    if (
      !network ||
      !flowStateQueryRes ||
      !address ||
      !gdaPool ||
      !publicClient
    ) {
      return;
    }

    try {
      setIsTransactionLoading(true);

      const hash = await writeContractAsync({
        address: network.gdaForwarder,
        abi: gdaForwarderAbi,
        functionName: "distributeFlow",
        args: [
          flowStateQueryRes.pools[0].matchingToken,
          address,
          gdaPool,
          parseEther(newFlowRate) / BigInt(SECONDS_IN_MONTH),
          "0x",
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash, confirmations: 3 });

      setIsTransactionLoading(false);
      setNewFlowRate("");
    } catch (err) {
      console.error(err);

      setIsTransactionLoading(false);
    }
  };

  return (
    <>
      <Sidebar />
      <Stack direction="vertical" className={!isMobile ? "w-75" : "w-100"}>
        <Stack direction="vertical" gap={4} className="px-5 py-4 mb-5">
          {!profileId || !chainId ? (
            <Card.Text>
              Program not found, please select one from{" "}
              <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : loading || !chainId ? (
            <Spinner className="m-auto" />
          ) : !poolId ? (
            <Card.Text>
              Pool not found, please select one from{" "}
              <Link
                href={`/sqf/pools/?chainId=${chainId}&profileId=${profileId}`}
              >
                Pool Selection
              </Link>
            </Card.Text>
          ) : !connectedChain ? (
            <>Please connect a wallet</>
          ) : connectedChain?.id !== network?.id ? (
            <Card.Text>
              Wrong network, please connect to{" "}
              <span
                className="p-0 text-decoration-underline cursor-pointer"
                onClick={() => switchChain({ chainId: network?.id ?? 10 })}
              >
                {network?.name}
              </span>{" "}
              or return to <Link href="/sqf">Program Selection</Link>
            </Card.Text>
          ) : (
            <>
              <Card.Text as="h1">Distribute funds to Matching Pool</Card.Text>
              {loading ? (
                <Spinner className="m-auto" />
              ) : (
                <Form>
                  <Form.Group className="mb-4">
                    <Form.Label>Matching Pool Address</Form.Label>
                    <InputGroup
                      className="gap-3 mb-3"
                      style={{ width: isMobile || isTablet ? "100%" : "75%" }}
                    >
                      <Form.Control
                        type="text"
                        value={gdaPool ?? ""}
                        disabled
                        className="rounded-2"
                      />
                      <Button
                        variant="secondary"
                        as="a"
                        href={`${network?.superfluidExplorer}/pools/${gdaPool}`}
                        target="_blank"
                        className="rounded-2 text-light"
                      >
                        View on Explorer
                      </Button>
                    </InputGroup>
                  </Form.Group>
                  <Form.Group className="mb-4">
                    <Form.Label>Current Funding Rate</Form.Label>
                    <InputGroup
                      className="mb-3"
                      style={{ width: isMobile || isTablet ? "100%" : "50%" }}
                    >
                      <Form.Control
                        type="text"
                        value={
                          !currentFlowRate && currentFlowRate !== BigInt(0)
                            ? "N/A"
                            : parseFloat(
                                Number(
                                  formatEther(
                                    currentFlowRate * BigInt(SECONDS_IN_MONTH),
                                  ),
                                ).toFixed(8),
                              )
                        }
                        disabled
                        className="rounded-2"
                      />
                      <InputGroup.Text className="bg-transparent border-0">
                        {
                          network?.tokens.find(
                            (token) =>
                              token.address.toLowerCase() ===
                              flowStateQueryRes?.pools[0].matchingToken,
                          )?.symbol
                        }
                        /month
                      </InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                  <Form.Group className="mb-4">
                    <Form.Label>New Funding Rate</Form.Label>
                    <InputGroup
                      style={{ width: isMobile || isTablet ? "100%" : "50%" }}
                    >
                      <Form.Control
                        type="text"
                        value={newFlowRate}
                        onChange={(e) => {
                          const { value } = e.target;
                          if (
                            isNumber(value) ||
                            value === "" ||
                            value === "."
                          ) {
                            setNewFlowRate(value);
                          }
                        }}
                        className="rounded-2"
                      />
                      <InputGroup.Text className="bg-transparent border-0">
                        {
                          network?.tokens.find(
                            (token) =>
                              token.address.toLowerCase() ===
                              flowStateQueryRes?.pools[0].matchingToken,
                          )?.symbol
                        }
                        /month
                      </InputGroup.Text>
                    </InputGroup>
                  </Form.Group>
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-start mt-4"
                  >
                    <Image src="/info.svg" alt="info" width={24} />
                    <Stack direction="vertical">
                      <Card.Text className="m-0">
                        Your Balance:{" "}
                        {parseFloat(
                          Number(formatEther(matchingTokenBalance)).toFixed(6),
                        )}
                      </Card.Text>
                      <Card.Text>
                        <Card.Link
                          href={`https://jumper.exchange/?fromChain=${chainId}&fromToken=0x0000000000000000000000000000000000000000&toChain=${chainId}&toToken=${matchingToken}`}
                          target="_blank"
                          className="text-primary text-decoration-none"
                        >
                          Swap
                        </Card.Link>{" "}
                        {!isMatchingTokenPureSuperToken && (
                          <>
                            or{" "}
                            <Card.Link
                              href="https://app.superfluid.finance/wrap?upgrade"
                              target="_blank"
                              className="text-primary text-decoration-none"
                            >
                              Wrap
                            </Card.Link>
                          </>
                        )}{" "}
                        to {matchingTokenSymbol}
                      </Card.Text>
                    </Stack>
                  </Stack>
                  <Button
                    className="mt-3 text-light"
                    style={{ width: isMobile || isTablet ? "100%" : "20%" }}
                    disabled={
                      !isNumber(newFlowRate) ||
                      !network ||
                      !flowStateQueryRes ||
                      !address ||
                      !gdaPool ||
                      !publicClient ||
                      matchingTokenBalance <= 0
                    }
                    onClick={handleStreamUpdate}
                  >
                    {isTransactionLoading ? (
                      <Spinner size="sm" />
                    ) : (
                      "Update Stream"
                    )}
                  </Button>
                </Form>
              )}
            </>
          )}
        </Stack>
      </Stack>
    </>
  );
}
