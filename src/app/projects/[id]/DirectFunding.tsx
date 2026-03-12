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
import { networks } from "@/lib/networks";
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

const USER_ACCOUNT_QUERY = gql`
  query UserAccountQuery($userAddress: String!, $token: String!) {
    account(id: $userAddress) {
      accountTokenSnapshots {
        totalNetFlowRate
        totalOutflowRate
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

const mainnetNetworks = networks.filter(
  (n) => n.id !== 11155420 && n.id !== 11155111,
);

type DirectFundingProps = {
  receiverAddress: string;
};

export default function DirectFunding({ receiverAddress }: DirectFundingProps) {
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(
    mainnetNetworks[0],
  );
  const [selectedToken, setSelectedToken] = useState<Token>(
    selectedNetwork.tokens[0],
  );
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
  const ethersProvider = useEthersProvider({ chainId: selectedNetwork.id });
  const ethersSigner = useEthersSigner({ chainId: selectedNetwork.id });
  const { areTransactionsLoading, transactionError, executeTransactions } =
    useTransactionsQueue();

  const isCorrectChain = walletChainId === selectedNetwork.id;

  const { data: underlyingTokenAddress } = useReadContract({
    address: selectedToken.address,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),
    functionName: "getUnderlyingToken",
    chainId: selectedNetwork.id,
  });

  const isSuperTokenNative =
    selectedToken.symbol === "ETHx" || selectedToken.symbol === "CELOx";
  const isSuperTokenPure =
    !isSuperTokenNative && underlyingTokenAddress === ZERO_ADDRESS;

  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: selectedNetwork.id,
    token:
      isSuperTokenNative || !underlyingTokenAddress
        ? void 0
        : (underlyingTokenAddress as Address),
    query: { refetchInterval: 10000, enabled: !isSuperTokenPure },
  });

  const { data: userQueryRes } = useQuery(USER_ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", selectedNetwork.id),
    variables: {
      userAddress: address?.toLowerCase() ?? "",
      token: selectedToken.address.toLowerCase(),
    },
    skip: !address,
    pollInterval: 10000,
  });

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

  const outflowToReceiver = useMemo(() => {
    if (!address || !receiverAddress || !userQueryRes?.account?.outflows) {
      return null;
    }

    return (
      userQueryRes.account.outflows.find(
        (o: { receiver: { id: string } }) =>
          o.receiver.id === receiverAddress.toLowerCase(),
      ) ?? null
    );
  }, [address, receiverAddress, userQueryRes]);

  const flowRateToReceiver = outflowToReceiver?.currentFlowRate ?? "0";

  useEffect(() => {
    const currentStreamValue = roundWeiAmount(
      BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
      4,
    );

    setMonthlyAmount(currentStreamValue !== "0" ? currentStreamValue : "");
  }, [flowRateToReceiver]);

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
          chainId: selectedNetwork.id,
          resolverAddress: selectedNetwork.superfluidResolver,
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
  }, [address, ethersProvider, selectedToken.address, selectedNetwork]);

  const transactions = useMemo(() => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !newFlowRate ||
      !ethersProvider ||
      !ethersSigner ||
      !receiverAddress
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

    if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.deleteFlow({
          sender: address,
          receiver: receiverAddress,
        }),
      );
    } else if (BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.updateFlow({
          sender: address,
          receiver: receiverAddress,
          flowRate: newFlowRate,
        }),
      );
    } else {
      operations.push(
        superToken.createFlow({
          sender: address,
          receiver: receiverAddress,
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
    flowRateToReceiver,
    ethersProvider,
    ethersSigner,
    receiverAddress,
    selectedToken.address,
    underlyingTokenAllowance,
  ]);

  const handleExecute = useCallback(async () => {
    setSuccessMessage("");

    try {
      await executeTransactions(transactions);
      setSuccessMessage(
        BigInt(flowRateToReceiver) > 0 ? "Stream updated!" : "Stream started!",
      );
    } catch {
      // transactionError state is set by the hook
    }
  }, [transactions, executeTransactions, flowRateToReceiver]);

  const handleCancel = useCallback(async () => {
    if (
      !address ||
      !sfFramework ||
      !superToken ||
      !ethersSigner ||
      !receiverAddress
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
              receiver: receiverAddress,
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
    receiverAddress,
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

  const userInflowRate =
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0) +
    BigInt(userAccountSnapshot?.totalOutflowRate ?? 0);
  const userInflowMonthly =
    userInflowRate > BigInt(0)
      ? formatNumber(
          Number(roundWeiAmount(userInflowRate * BigInt(SECONDS_IN_MONTH), 4)),
        )
      : null;

  const hasExistingFlow = BigInt(flowRateToReceiver) > 0;
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
        <span className="fw-bold fs-lg d-block mb-5">Fund Project</span>

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
                  src={selectedNetwork.icon}
                  alt=""
                  width={20}
                  height={20}
                  className="rounded-circle"
                />
                {selectedNetwork.name}
              </Stack>
            </Dropdown.Toggle>
            <Dropdown.Menu className="w-100">
              {mainnetNetworks.map((net) => (
                <Dropdown.Item
                  key={net.id}
                  active={net.id === selectedNetwork.id}
                  onClick={() => {
                    setSelectedNetwork(net);
                    setSelectedToken(net.tokens[0]);
                    setWrapAmount("");
                    setMonthlyAmount("");
                    setNewFlowRate("");
                  }}
                >
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-center"
                  >
                    <Image
                      src={net.icon}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded-circle"
                    />
                    {net.name}
                  </Stack>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>

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
              {selectedNetwork.tokens.map((token) => (
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
                  BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
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
            <Stack
              direction="horizontal"
              gap={1}
              className="align-items-center"
            >
              <span className="fw-bold" style={{ fontSize: "0.85rem" }}>
                {formatNumber(Number(formatEther(superTokenBalance)))}
              </span>
              {userInflowMonthly && (
                <span className="text-success" style={{ fontSize: "0.75rem" }}>
                  +{userInflowMonthly}/mo
                </span>
              )}
            </Stack>
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
              onClick={() => switchChain({ chainId: selectedNetwork.id })}
            >
              Switch to {selectedNetwork.name}
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
