import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
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
import useFlowingAmount from "@/hooks/flowingAmount";
import { getApolloClient } from "@/lib/apollo";
import { isNumber } from "@/lib/utils";
import { networks } from "@/lib/networks";
import { strategyAbi } from "@/lib/abi/strategy";
import { gdaForwarderAbi } from "@/lib/abi/gdaForwarder";
import { SECONDS_IN_MONTH, ZERO_ADDRESS } from "@/lib/constants";

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

export default function MatchinPool() {
  const [newFlowRate, setNewFlowRate] = useState("");
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);

  const router = useRouter();
  const { profileId, poolId } = router.query;
  const chainId = Number(router.query.chainId) ?? null;
  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const network = networks.find((network) => network.id === Number(chainId));
  const publicClient = usePublicClient();
  const { data: streamingFundQueryRes, loading } = useQuery(POOL_BY_ID_QUERY, {
    client: getApolloClient("streamingfund"),
    variables: {
      poolId,
      chainId,
    },
    skip: !poolId,
  });
  const matchingToken = streamingFundQueryRes
    ? (streamingFundQueryRes.pools[0].matchingToken as Address)
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
    address: streamingFundQueryRes?.pools[0].strategyAddress,
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
    )?.name ?? "matching token";
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
      !streamingFundQueryRes ||
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
          streamingFundQueryRes.pools[0].matchingToken,
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
    <Stack direction="vertical" gap={4} className="px-5 py-4">
      {!profileId || !chainId ? (
        <Card.Text>
          Program not found, please select one from{" "}
          <Link href="/admin" className="text-decoration-underline">
            Program Selection
          </Link>
        </Card.Text>
      ) : loading || !chainId ? (
        <Spinner className="m-auto" />
      ) : !poolId ? (
        <Card.Text>
          Pool not found, please select one from{" "}
          <Link
            href={`/admin/pools/?chainId=${chainId}&profileId=${profileId}`}
            className="text-decoration-underline"
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
          or return to{" "}
          <Link href="/admin" className="text-decoration-underline">
            Program Selection
          </Link>
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
                <InputGroup className="gap-3 mb-3 w-75">
                  <Form.Control
                    type="text"
                    value={gdaPool ?? ""}
                    disabled
                    className="rounded-2"
                  />
                  <Button
                    variant="secondary"
                    as="a"
                    href={`${network?.superfluidConsole}/pools/${gdaPool}`}
                    target="_blank"
                    className="rounded-2 text-light"
                  >
                    View on Console
                  </Button>
                </InputGroup>
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>Current Funding Rate</Form.Label>
                <InputGroup className="mb-3 w-50">
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
                          streamingFundQueryRes?.pools[0].matchingToken,
                      )?.name
                    }
                    /month
                  </InputGroup.Text>
                </InputGroup>
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label>New Funding Rate</Form.Label>
                <InputGroup className="w-50">
                  <Form.Control
                    type="text"
                    value={newFlowRate}
                    onChange={(e) => {
                      const { value } = e.target;
                      if (isNumber(value) || value === "" || value === ".") {
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
                          streamingFundQueryRes?.pools[0].matchingToken,
                      )?.name
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
                      className="text-primary"
                    >
                      Swap
                    </Card.Link>{" "}
                    {!isMatchingTokenPureSuperToken && (
                      <>
                        or{" "}
                        <Card.Link
                          href="https://app.superfluid.finance/wrap?upgrade"
                          target="_blank"
                          className="text-primary"
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
                className="w-20 mt-3 text-light"
                disabled={
                  !isNumber(newFlowRate) ||
                  !network ||
                  !streamingFundQueryRes ||
                  !address ||
                  !gdaPool ||
                  !publicClient ||
                  matchingTokenBalance <= 0
                }
                onClick={handleStreamUpdate}
              >
                {isTransactionLoading ? <Spinner size="sm" /> : "Update Stream"}
              </Button>
            </Form>
          )}
        </>
      )}
    </Stack>
  );
}
