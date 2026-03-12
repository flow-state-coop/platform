"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Address,
  isAddress,
  parseAbi,
  parseEther,
  formatEther,
  formatUnits,
} from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import {
  NativeAssetSuperToken,
  WrapperSuperToken,
  SuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Image from "react-bootstrap/Image";
import Dropdown from "react-bootstrap/Dropdown";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { parseGardensPoolUrl } from "@/lib/gardensPool";
import { getApolloClient } from "@/lib/apollo";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useFlowingAmount from "@/hooks/flowingAmount";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  formatNumber,
} from "@/lib/utils";
import { SECONDS_IN_MONTH, MAX_FLOW_RATE, ZERO_ADDRESS } from "@/lib/constants";

const GARDENS_POOL_QUERY = gql`
  query GardensPoolQuery($poolAddress: ID!, $token: String!) {
    account(id: $poolAddress) {
      accountTokenSnapshots(where: { token: $token }) {
        totalInflowRate
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
      }
      inflows(where: { currentFlowRate_gt: "0", token: $token }) {
        sender {
          id
        }
        currentFlowRate
      }
    }
  }
`;

const USER_OUTFLOW_QUERY = gql`
  query UserOutflowQuery($userAddress: String!, $token: String!) {
    account(id: $userAddress) {
      accountTokenSnapshots {
        totalNetFlowRate
        totalOutflowRate
        totalDeposit
        balanceUntilUpdatedAt
        updatedAtTimestamp
        token {
          id
        }
      }
      outflows(
        where: { token: $token }
        orderBy: updatedAtTimestamp
        orderDirection: desc
      ) {
        receiver {
          id
        }
        currentFlowRate
      }
    }
  }
`;

type GardensPoolFundingProps = {
  gardensPoolUrl: string;
  network: Network;
  fundingAddresses: string[];
};

export default function GardensPoolFunding({
  gardensPoolUrl,
  network,
  fundingAddresses,
}: GardensPoolFundingProps) {
  const parsed = parseGardensPoolUrl(gardensPoolUrl);
  const poolAddress = parsed?.poolAddress ?? "";

  const [selectedToken, setSelectedToken] = useState<Token>(network.tokens[0]);
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [newFlowRate, setNewFlowRate] = useState("");
  const [sfFramework, setSfFramework] = useState<Framework | null>(null);
  const [superToken, setSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken | null
  >(null);
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [successMessage, setSuccessMessage] = useState("");

  const { address, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
  const { areTransactionsLoading, transactionError, executeTransactions } =
    useTransactionsQueue();

  const isCorrectChain = walletChainId === network.id;

  const { data: underlyingTokenAddress } = useReadContract({
    address: selectedToken.address,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),
    functionName: "getUnderlyingToken",
    chainId: network.id,
  });

  const isSuperTokenNative =
    selectedToken.symbol === "ETHx" || selectedToken.symbol === "CELOx";
  const isSuperTokenPure =
    !isSuperTokenNative && underlyingTokenAddress === ZERO_ADDRESS;

  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network.id,
    token:
      isSuperTokenNative || !underlyingTokenAddress
        ? void 0
        : (underlyingTokenAddress as Address),
    query: { refetchInterval: 10000, enabled: !isSuperTokenPure },
  });

  const { data: poolQueryRes } = useQuery(GARDENS_POOL_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      poolAddress: poolAddress.toLowerCase(),
      token: selectedToken.address.toLowerCase(),
    },
    skip: !poolAddress,
    pollInterval: 10000,
  });

  const { data: userQueryRes } = useQuery(USER_OUTFLOW_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      userAddress: address?.toLowerCase() ?? "",
      token: selectedToken.address.toLowerCase(),
    },
    skip: !address,
    pollInterval: 10000,
  });

  const poolSnapshot =
    poolQueryRes?.account?.accountTokenSnapshots?.[0] ?? null;
  const totalInflowRate = poolSnapshot?.totalInflowRate ?? "0";

  const projectInflowRate = useMemo(() => {
    const inflows = poolQueryRes?.account?.inflows ?? [];
    const normalizedAddresses = fundingAddresses.map((a) => a.toLowerCase());
    let rate = BigInt(0);

    for (const inflow of inflows) {
      if (normalizedAddresses.includes(inflow.sender.id.toLowerCase())) {
        rate += BigInt(inflow.currentFlowRate);
      }
    }

    return rate;
  }, [poolQueryRes, fundingAddresses]);

  const userAccountSnapshot =
    userQueryRes?.account?.accountTokenSnapshots?.find(
      (s: { token: { id: string } }) =>
        s.token.id === selectedToken.address.toLowerCase(),
    ) ?? null;

  const superTokenBalance = useFlowingAmount(
    BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? 0),
    userAccountSnapshot?.updatedAtTimestamp ?? 0,
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0),
  );

  const outflowToPool = useMemo(() => {
    if (!address || !poolAddress || !userQueryRes?.account?.outflows) {
      return null;
    }

    return (
      userQueryRes.account.outflows.find(
        (o: { receiver: { id: string } }) =>
          o.receiver.id === poolAddress.toLowerCase(),
      ) ?? null
    );
  }, [address, poolAddress, userQueryRes]);

  const flowRateToPool = outflowToPool?.currentFlowRate ?? "0";

  useEffect(() => {
    const currentStreamValue = roundWeiAmount(
      BigInt(flowRateToPool) * BigInt(SECONDS_IN_MONTH),
      4,
    );

    setMonthlyAmount(currentStreamValue !== "0" ? currentStreamValue : "");
  }, [flowRateToPool]);

  useEffect(() => {
    if (!areTransactionsLoading && monthlyAmount) {
      const rate =
        parseEther(monthlyAmount.replace(/,/g, "")) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

      if (rate < MAX_FLOW_RATE) {
        setNewFlowRate(rate.toString());
      }
    }
  }, [areTransactionsLoading, monthlyAmount]);

  useEffect(() => {
    (async () => {
      if (address && ethersProvider && isAddress(selectedToken.address)) {
        const framework = await Framework.create({
          chainId: network.id,
          resolverAddress: network.superfluidResolver,
          provider: ethersProvider,
        });
        const token = await framework.loadSuperToken(selectedToken.address);
        const underlying = token.underlyingToken;
        const allowance = await underlying?.allowance({
          owner: address,
          spender: token.address,
          providerOrSigner: ethersProvider,
        });

        setUnderlyingTokenAllowance(allowance ?? "0");
        setSfFramework(framework);
        setSuperToken(token);
      }
    })();
  }, [address, ethersProvider, selectedToken.address, network]);

  const transactions = useMemo(() => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !newFlowRate ||
      !ethersProvider ||
      !ethersSigner ||
      !poolAddress
    ) {
      return [];
    }

    const underlyingToken = superToken.underlyingToken;
    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const isWrapperSuperToken =
      underlyingToken && underlyingToken.address !== ZERO_ADDRESS;
    const needsApproval =
      isWrapperSuperToken &&
      wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0);
    const txs: (() => Promise<void>)[] = [];
    const operations: Operation[] = [];

    if (wrapAmount && Number(wrapAmount.replace(/,/g, "")) > 0) {
      if (underlyingToken && needsApproval) {
        txs.push(async () => {
          const tx = await underlyingToken
            .approve({
              receiver: selectedToken.address,
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);
          await tx.wait();
        });
      }

      if (isWrapperSuperToken) {
        operations.push(
          (superToken as WrapperSuperToken).upgrade({
            amount: wrapAmountWei.toString(),
          }),
        );
      } else {
        txs.push(async () => {
          const tx = await (superToken as NativeAssetSuperToken)
            .upgrade({ amount: wrapAmountWei.toString() })
            .exec(ethersSigner);
          await tx.wait();
        });
      }
    }

    if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToPool) > 0) {
      operations.push(
        superToken.deleteFlow({
          sender: address,
          receiver: poolAddress,
        }),
      );
    } else if (BigInt(flowRateToPool) > 0) {
      operations.push(
        superToken.updateFlow({
          sender: address,
          receiver: poolAddress,
          flowRate: newFlowRate,
        }),
      );
    } else {
      operations.push(
        superToken.createFlow({
          sender: address,
          receiver: poolAddress,
          flowRate: newFlowRate,
        }),
      );
    }

    txs.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);
      await tx.wait();
    });

    return txs;
  }, [
    address,
    sfFramework,
    superToken,
    wrapAmount,
    newFlowRate,
    flowRateToPool,
    ethersProvider,
    ethersSigner,
    poolAddress,
    selectedToken.address,
    underlyingTokenAllowance,
  ]);

  const handleExecute = useCallback(async () => {
    setSuccessMessage("");

    try {
      await executeTransactions(transactions);
      setSuccessMessage(
        BigInt(flowRateToPool) > 0 ? "Stream updated!" : "Stream started!",
      );
    } catch {
      // transactionError state is set by the hook
    }
  }, [transactions, executeTransactions, flowRateToPool]);

  const handleCancel = useCallback(async () => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !ethersSigner ||
      !poolAddress
    ) {
      return;
    }

    setSuccessMessage("");

    const cancelTxs = [
      async () => {
        const tx = await sfFramework
          .batchCall([
            superToken.deleteFlow({
              sender: address,
              receiver: poolAddress,
            }),
          ])
          .exec(ethersSigner);
        await tx.wait();
      },
    ];

    try {
      await executeTransactions(cancelTxs);
      setMonthlyAmount("");
      setNewFlowRate("");
      setSuccessMessage("Stream cancelled.");
    } catch {
      // transactionError state is set by the hook
    }
  }, [
    address,
    sfFramework,
    superToken,
    ethersSigner,
    poolAddress,
    executeTransactions,
  ]);

  const handleMonthlyAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");

    if (cleaned === "" || cleaned === ".") {
      setMonthlyAmount(cleaned);
      setNewFlowRate("0");
      return;
    }

    const rate =
      parseEther(cleaned) /
      BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

    if (rate < MAX_FLOW_RATE) {
      setMonthlyAmount(cleaned);
      setNewFlowRate(rate.toString());
    }
  };

  const totalMonthly = roundWeiAmount(
    BigInt(totalInflowRate) * BigInt(SECONDS_IN_MONTH),
    4,
  );
  const projectMonthly = roundWeiAmount(
    projectInflowRate * BigInt(SECONDS_IN_MONTH),
    4,
  );
  const hasExistingFlow = BigInt(flowRateToPool) > 0;
  const canExecute =
    !!address &&
    !!newFlowRate &&
    BigInt(newFlowRate) > 0 &&
    !areTransactionsLoading;

  return (
    <Card
      className="border-0 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(var(--bs-primary-rgb), 0.04), rgba(var(--bs-primary-rgb), 0.01))",
        boxShadow:
          "0 0 0 1px rgba(var(--bs-primary-rgb), 0.15), 0 4px 24px rgba(0,0,0,0.06)",
      }}
    >
      <Card.Body className="p-5">
        <Stack
          direction="horizontal"
          gap={2}
          className="mb-5 align-items-center"
        >
          <Image src="/gardens.svg" alt="" width={24} height={24} />
          <span className="fw-bold fs-lg">Fund via Gardens Pool</span>
        </Stack>

        <Stack direction="horizontal" gap={4} className="mb-5">
          <Stack direction="vertical" className="flex-fill">
            <span
              className="text-uppercase fw-bold"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.05em",
                opacity: 0.5,
              }}
            >
              Total rate
            </span>
            <span className="fw-bold">
              {formatNumber(Number(totalMonthly))}{" "}
              <span
                className="text-muted fw-normal"
                style={{ fontSize: "0.8rem" }}
              >
                {selectedToken.symbol}/mo
              </span>
            </span>
          </Stack>
          <Stack direction="vertical" className="flex-fill">
            <span
              className="text-uppercase fw-bold"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.05em",
                opacity: 0.5,
              }}
            >
              From project
            </span>
            <span className="fw-bold">
              {formatNumber(Number(projectMonthly))}{" "}
              <span
                className="text-muted fw-normal"
                style={{ fontSize: "0.8rem" }}
              >
                {selectedToken.symbol}/mo
              </span>
            </span>
          </Stack>
        </Stack>

        <Stack direction="vertical" gap={3}>
          <Dropdown>
            <Dropdown.Toggle
              variant="outline-secondary"
              className="w-100 d-flex align-items-center justify-content-between rounded-3"
            >
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-center"
              >
                <Image
                  src={selectedToken.icon}
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-circle"
                />
                {selectedToken.symbol}
              </Stack>
            </Dropdown.Toggle>
            <Dropdown.Menu className="w-100">
              {network.tokens.map((token) => (
                <Dropdown.Item
                  key={token.address}
                  active={token.address === selectedToken.address}
                  onClick={() => {
                    setSelectedToken(token);
                    setWrapAmount("");
                  }}
                >
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-center"
                  >
                    <Image
                      src={token.icon}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded-circle"
                    />
                    {token.symbol}
                  </Stack>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>

          <Form.Group>
            <Form.Label className="fw-bold" style={{ fontSize: "0.75rem" }}>
              Monthly stream rate
            </Form.Label>
            <Form.Control
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={monthlyAmount}
              onChange={(e) => handleMonthlyAmountChange(e.target.value)}
              className="rounded-3"
            />
            {hasExistingFlow && (
              <Form.Text className="text-success">
                Current:{" "}
                {roundWeiAmount(
                  BigInt(flowRateToPool) * BigInt(SECONDS_IN_MONTH),
                  4,
                )}{" "}
                {selectedToken.symbol}/mo
              </Form.Text>
            )}
          </Form.Group>

          {!isSuperTokenPure && (
            <Form.Group>
              <Form.Label className="fw-bold" style={{ fontSize: "0.75rem" }}>
                Wrap amount ({isSuperTokenNative ? "ETH" : "underlying token"})
              </Form.Label>
              <Form.Control
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={wrapAmount}
                onChange={(e) =>
                  setWrapAmount(e.target.value.replace(/[^0-9.,]/g, ""))
                }
                className="rounded-3"
              />
              {underlyingTokenBalance && (
                <Form.Text>
                  Available:{" "}
                  {formatNumber(
                    Number(
                      formatUnits(
                        underlyingTokenBalance.value,
                        underlyingTokenBalance.decimals,
                      ),
                    ),
                  )}{" "}
                  {underlyingTokenBalance.symbol}
                </Form.Text>
              )}
            </Form.Group>
          )}

          <Stack
            direction="horizontal"
            className="justify-content-between align-items-center rounded-3 px-3 py-2"
            style={{
              background: "rgba(var(--bs-primary-rgb), 0.06)",
            }}
          >
            <span style={{ fontSize: "0.8rem" }}>
              {selectedToken.symbol} balance
            </span>
            <span className="fw-bold" style={{ fontSize: "0.85rem" }}>
              {formatNumber(Number(formatEther(superTokenBalance)))}
            </span>
          </Stack>

          {transactionError && (
            <div className="text-danger" style={{ fontSize: "0.85rem" }}>
              {transactionError}
            </div>
          )}
          {successMessage && (
            <div
              className="text-success fw-bold"
              style={{ fontSize: "0.85rem" }}
            >
              {successMessage}
            </div>
          )}

          {!isCorrectChain ? (
            <Button
              variant="primary"
              className="w-100 rounded-3 fw-bold"
              onClick={() => switchChain({ chainId: network.id })}
            >
              Switch to {network.name}
            </Button>
          ) : (
            <Stack direction="horizontal" gap={2}>
              <Button
                variant="primary"
                className="flex-fill rounded-3 fw-bold"
                disabled={!canExecute}
                onClick={handleExecute}
              >
                {areTransactionsLoading ? (
                  <Spinner size="sm" />
                ) : hasExistingFlow ? (
                  "Update Stream"
                ) : (
                  "Start Stream"
                )}
              </Button>
              {hasExistingFlow && (
                <Button
                  variant="outline-danger"
                  className="rounded-3 fw-bold"
                  disabled={areTransactionsLoading}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Card.Body>
    </Card>
  );
}
