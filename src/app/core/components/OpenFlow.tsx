import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Address, parseAbi, parseEther, formatEther } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import {
  SuperToken,
  NativeAssetSuperToken,
  WrapperSuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Toast from "react-bootstrap/Toast";
import InputGroup from "react-bootstrap/InputGroup";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import BalancePlot, {
  BalancePlotFlowInfo,
} from "@/app/flow-splitters/components/BalancePlot";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { networks } from "@/lib/networks";
import { getApolloClient } from "@/lib/apollo";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  isNumber,
  formatNumber,
  convertStreamValueToInterval,
} from "@/lib/utils";
import { ZERO_ADDRESS, FLOW_STATE_RECEIVER } from "@/lib/constants";

dayjs().format();
dayjs.extend(duration);

type OpenFlowProps = {
  network: Network;
  token: Token;
  selectToken: (token: Token) => void;
  handleClose?: () => void;
};

const ACCOUNT_TOKEN_SNAPSHOT_QUERY = gql`
  query AccountTokenSnapshot(
    $address: String
    $token: String
    $receiver: String
  ) {
    account(id: $address) {
      accountTokenSnapshots(where: { token: $token }) {
        totalNetFlowRate
        maybeCriticalAtTimestamp
        token {
          id
        }
      }
      poolMemberships(where: { pool_: { token: $token } }) {
        units
        isConnected
        pool {
          flowRate
          adjustmentFlowRate
          totalUnits
        }
      }
      outflows(
        where: { token: $token, receiver: $receiver, currentFlowRate_gt: "0" }
      ) {
        currentFlowRate
      }
    }
    token(id: $token) {
      isNativeAssetSuperToken
      underlyingAddress
    }
  }
`;

export default function OpenFlow(props: OpenFlowProps) {
  const { network, token, selectToken, handleClose } = props;

  const balancePlotFlowInfoSnapshot = useRef<BalancePlotFlowInfo | null>(null);

  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [wrapAmountPerTimeInterval, setWrapAmountPerTimeInterval] =
    useState("");
  const [wrapTimeInterval, setWrapTimeInterval] = useState("");
  const [newFlowRate, setNewFlowRate] = useState(BigInt(0));
  const [showWrappingStep, setShowWrappingStep] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sfFramework, setSfFramework] = useState<Framework>();
  const [distributionSuperToken, setDistributionSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken
  >();
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("");
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);
  const [isDeletingFlow, setIsDeletingFlow] = useState(false);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
  const router = useRouter();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: superfluidQueryRes } = useQuery(ACCOUNT_TOKEN_SNAPSHOT_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      address: address?.toLowerCase() ?? "",
      token: token?.address.toLowerCase() ?? "",
      receiver: FLOW_STATE_RECEIVER,
    },
    pollInterval: 10000,
    skip: !address || !token,
  });
  const accountTokenSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots[0] ?? null;
  const flowRateToReceiver =
    superfluidQueryRes?.account?.outflows[0]?.currentFlowRate ?? "0";
  const poolMemberships = superfluidQueryRes?.account?.poolMemberships ?? null;
  const { data: realtimeBalanceOfNow } = useReadContract({
    address: token?.address,
    functionName: "realtimeBalanceOfNow",
    abi: parseAbi([
      "function realtimeBalanceOfNow(address) returns (int256,uint256,uint256,uint256)",
    ]),
    args: [address],
    chainId: network.id,
    query: {
      refetchInterval: 10000,
    },
  });

  const balanceUntilUpdatedAt = realtimeBalanceOfNow?.[0];
  const updatedAtTimestamp = realtimeBalanceOfNow
    ? Number(realtimeBalanceOfNow[3])
    : null;
  const superTokenBalance = useFlowingAmount(
    BigInt(balanceUntilUpdatedAt ?? 0),
    updatedAtTimestamp ?? 0,
    BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0),
  );
  const isSuperTokenNative = superfluidQueryRes?.token?.isNativeAssetSuperToken;
  const isSuperTokenPure =
    !isSuperTokenNative &&
    superfluidQueryRes?.token?.underlyingAddress === ZERO_ADDRESS;
  const isSuperTokenWrapper = !isSuperTokenNative && !isSuperTokenPure;
  const { data: ethBalance } = useBalance({
    address,
    chainId: network?.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: superfluidQueryRes?.token?.underlyingAddress as Address,
    chainId: network.id,
    query: {
      refetchInterval: 10000,
      enabled: isSuperTokenWrapper,
    },
  });

  const hasSufficientSuperTokenBalance =
    (isSuperTokenNative &&
      ethBalance &&
      ethBalance.value + superTokenBalance > BigInt(0)) ||
    (!isSuperTokenPure &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance > BigInt(0)) ||
    superTokenBalance > BigInt(0)
      ? true
      : false;
  const hasSufficientWrappingBalance =
    (isSuperTokenNative &&
      ethBalance &&
      ethBalance?.value >= parseEther(wrapAmountPerTimeInterval)) ||
    (underlyingTokenBalance &&
      underlyingTokenBalance?.value >= parseEther(wrapAmountPerTimeInterval))
      ? true
      : false;
  const minDonationPerMonth = getPoolFlowRateConfig(
    token.symbol,
  ).minAllocationPerMonth;
  const isAmountInsufficient =
    Number(amountPerTimeInterval) > 0 &&
    Number(
      convertStreamValueToInterval(
        parseEther(amountPerTimeInterval),
        timeInterval,
        TimeInterval.MONTH,
      ),
    ) < minDonationPerMonth;

  const canSubmit =
    (newFlowRate > 0 || BigInt(flowRateToReceiver) > 0) &&
    BigInt(flowRateToReceiver) !== newFlowRate &&
    hasSufficientSuperTokenBalance &&
    (!wrapAmountPerTimeInterval ||
      wrapAmountPerTimeInterval === "0" ||
      hasSufficientWrappingBalance) &&
    !isAmountInsufficient;

  const membershipsInflowRate = useMemo(() => {
    let membershipsInflowRate = BigInt(0);

    if (poolMemberships) {
      for (const poolMembership of poolMemberships) {
        if (!poolMembership.isConnected) {
          continue;
        }

        const adjustedFlowRate =
          BigInt(poolMembership.pool.flowRate) -
          BigInt(poolMembership.pool.adjustmentFlowRate);
        const memberFlowRate =
          BigInt(poolMembership.pool.totalUnits) > 0
            ? (BigInt(poolMembership.units) * adjustedFlowRate) /
              BigInt(poolMembership.pool.totalUnits)
            : BigInt(0);

        membershipsInflowRate += memberFlowRate;
      }
    }

    return membershipsInflowRate;
  }, [poolMemberships]);

  const editFlow = useCallback(
    (
      superToken: NativeAssetSuperToken | WrapperSuperToken | SuperToken,
      receiver: string,
      oldFlowRate: string,
      newFlowRate: string,
    ) => {
      if (!address) {
        throw Error("Could not find the account address");
      }

      let op: Operation;

      if (BigInt(newFlowRate) === BigInt(0)) {
        op = superToken.deleteFlow({
          sender: address,
          receiver,
        });
      } else if (BigInt(oldFlowRate) !== BigInt(0)) {
        op = superToken.updateFlow({
          sender: address,
          receiver,
          flowRate: newFlowRate,
        });
      } else {
        op = superToken.createFlow({
          sender: address,
          receiver,
          flowRate: newFlowRate,
        });
      }

      return op;
    },
    [address],
  );

  const calcLiquidationEstimate = useCallback(
    (newFlowRate: bigint, wrapAmount: string = "0") => {
      if (address) {
        const accountFlowRate =
          BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0) +
          membershipsInflowRate;
        const wrapAmountWei = parseEther(wrapAmount);

        if (
          -accountFlowRate - BigInt(flowRateToReceiver) + newFlowRate >
          BigInt(0)
        ) {
          const date = dayjs(
            new Date(
              updatedAtTimestamp ? updatedAtTimestamp * 1000 : Date.now(),
            ),
          );

          return date
            .add(
              dayjs.duration({
                seconds: Number(
                  (BigInt(balanceUntilUpdatedAt ?? 0) + wrapAmountWei) /
                    (-accountFlowRate -
                      BigInt(flowRateToReceiver) +
                      newFlowRate),
                ),
              }),
            )
            .unix();
        }
      }

      return null;
    },
    [
      accountTokenSnapshot,
      balanceUntilUpdatedAt,
      updatedAtTimestamp,
      address,
      flowRateToReceiver,
      membershipsInflowRate,
    ],
  );

  const balancePlotFlowInfo = useMemo(() => {
    if (areTransactionsLoading && balancePlotFlowInfoSnapshot?.current) {
      return balancePlotFlowInfoSnapshot.current;
    }

    const startingBalance = balanceUntilUpdatedAt
      ? BigInt(balanceUntilUpdatedAt) +
        (BigInt(accountTokenSnapshot?.totalNetFlowRate ?? 0) *
          BigInt(Date.now() - (updatedAtTimestamp ?? 0) * 1000)) /
          BigInt(1000)
      : BigInt(0);
    const totalNetFlowRate = accountTokenSnapshot
      ? BigInt(accountTokenSnapshot.totalNetFlowRate) + membershipsInflowRate
      : BigInt(0);

    const result = {
      currentStartingBalance: startingBalance,
      newStartingBalance:
        startingBalance + parseEther(wrapAmountPerTimeInterval ?? 0),
      currentTotalFlowRate: totalNetFlowRate,
      currentLiquidation: calcLiquidationEstimate(BigInt(flowRateToReceiver)),
      newTotalFlowRate:
        BigInt(flowRateToReceiver) !== newFlowRate
          ? totalNetFlowRate + BigInt(flowRateToReceiver) - newFlowRate
          : totalNetFlowRate,
      newLiquidation: calcLiquidationEstimate(
        newFlowRate,
        wrapAmountPerTimeInterval,
      ),
    };

    balancePlotFlowInfoSnapshot.current = result;

    return result;
  }, [
    areTransactionsLoading,
    accountTokenSnapshot,
    balanceUntilUpdatedAt,
    updatedAtTimestamp,
    membershipsInflowRate,
    flowRateToReceiver,
    wrapAmountPerTimeInterval,
    newFlowRate,
    calcLiquidationEstimate,
  ]);

  useEffect(() => {
    if (address && flowRateToReceiver && !areTransactionsLoading) {
      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToReceiver) *
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH])),
        4,
      );

      setAmountPerTimeInterval(currentStreamValue);
      setNewFlowRate(BigInt(flowRateToReceiver));
    }
  }, [address, flowRateToReceiver, areTransactionsLoading]);

  useEffect(() => {
    const liquidationEstimate = calcLiquidationEstimate(newFlowRate);

    if (
      newFlowRate > 0 &&
      liquidationEstimate &&
      dayjs
        .unix(liquidationEstimate)
        .isBefore(dayjs().add(dayjs.duration({ months: 3 })))
    ) {
      setShowWrappingStep(true);
    }
  }, [calcLiquidationEstimate, newFlowRate]);

  useEffect(() => {
    (async () => {
      if (
        !token.address ||
        !ethersProvider ||
        !address ||
        !network.tokens.find((t) => t.address === token.address)
      ) {
        return;
      }

      const sfFramework = await Framework.create({
        chainId: network.id,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const distributionSuperToken = await sfFramework.loadSuperToken(
        token.address,
      );
      const underlyingToken = distributionSuperToken.underlyingToken;
      const underlyingTokenAllowance = await underlyingToken?.allowance({
        owner: address,
        spender: distributionSuperToken.address,
        providerOrSigner: ethersProvider,
      });

      setUnderlyingTokenAllowance(underlyingTokenAllowance ?? "0");
      setSfFramework(sfFramework);
      setDistributionSuperToken(distributionSuperToken);
    })();
  }, [address, network, ethersProvider, token]);

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !underlyingTokenAllowance ||
        !distributionSuperToken ||
        !sfFramework ||
        !ethersProvider ||
        !ethersSigner
      ) {
        return [];
      }

      const wrapAmountWei = parseEther(wrapAmountPerTimeInterval);
      const underlyingToken = distributionSuperToken.underlyingToken;
      const approvalTransactionsCount =
        isSuperTokenWrapper &&
        wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0)
          ? 1
          : 0;
      const transactions: (() => Promise<void>)[] = [];
      const operations: Operation[] = [];

      if (!isSuperTokenPure && wrapAmountWei > 0) {
        if (underlyingToken && approvalTransactionsCount > 0) {
          transactions.push(async () => {
            const tx = await underlyingToken
              .approve({
                receiver: distributionSuperToken.address,
                amount: wrapAmountWei.toString(),
              })
              .exec(ethersSigner);

            await tx.wait();
          });
        }

        if (isSuperTokenWrapper) {
          operations.push(
            (distributionSuperToken as WrapperSuperToken).upgrade({
              amount: wrapAmountWei.toString(),
            }),
          );
        } else {
          transactions.push(async () => {
            const tx = await (distributionSuperToken as NativeAssetSuperToken)
              .upgrade({
                amount: wrapAmountWei.toString(),
              })
              .exec(ethersSigner);

            await tx.wait();
          });
        }
      }

      operations.push(
        editFlow(
          distributionSuperToken,
          FLOW_STATE_RECEIVER,
          flowRateToReceiver,
          newFlowRate.toString(),
        ),
      );

      transactions.push(async () => {
        const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

        await tx.wait();
      });

      setTransactions(transactions);
    })();
  }, [
    address,
    wrapAmountPerTimeInterval,
    newFlowRate,
    underlyingTokenAllowance,
    sfFramework,
    ethersProvider,
    ethersSigner,
    distributionSuperToken,
    isSuperTokenPure,
    isSuperTokenWrapper,
    editFlow,
    flowRateToReceiver,
  ]);

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;

    if (isNumber(value)) {
      const newFlowRate =
        parseEther(value) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]));

      setAmountPerTimeInterval(value);
      setNewFlowRate(newFlowRate);

      if (wrapAmountPerTimeInterval) {
        setWrapTimeInterval(
          parseFloat(
            (
              Number(wrapAmountPerTimeInterval) /
              Number(formatEther(newFlowRate)) /
              fromTimeUnitsToSeconds(1, unitOfTime[timeInterval])
            ).toFixed(2),
          ).toString(),
        );
      }
    } else if (value === "") {
      setAmountPerTimeInterval("");
      setNewFlowRate(BigInt(0));
    } else if (value === ".") {
      setAmountPerTimeInterval("0.");
      setNewFlowRate(BigInt(0));
    }
  };

  const handleWrapAmountSelection = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { value } = e.target;

    if (isNumber(value)) {
      setWrapAmountPerTimeInterval(value);
      setWrapTimeInterval(
        parseFloat(
          (
            Number(value) /
            Number(formatEther(newFlowRate)) /
            fromTimeUnitsToSeconds(1, unitOfTime[timeInterval])
          ).toFixed(4),
        ).toString(),
      );
    } else if (value === "") {
      setWrapAmountPerTimeInterval("");
      setWrapTimeInterval("0");
    } else if (value === ".") {
      setWrapAmountPerTimeInterval("0.");
      setWrapTimeInterval("0");
    }
  };

  const handleWrapTimeIntervalSelection = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { value } = e.target;

    if (isNumber(value)) {
      setWrapTimeInterval(value);
      setWrapAmountPerTimeInterval(
        parseFloat(
          (
            Number(value) *
            Number(formatEther(newFlowRate)) *
            fromTimeUnitsToSeconds(1, unitOfTime[timeInterval])
          ).toFixed(4),
        ).toString(),
      );
    } else if (value === "") {
      setWrapTimeInterval("");
      setWrapAmountPerTimeInterval("");
    } else if (value === ".") {
      setWrapTimeInterval("0.");
      setWrapAmountPerTimeInterval("0");
    }
  };

  const handleSubmit = async () => {
    try {
      await executeTransactions(transactions);

      setSuccess(true);
      setWrapAmountPerTimeInterval("");
      setTimeInterval(TimeInterval.MONTH);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFlow = async () => {
    if (!distributionSuperToken || !ethersSigner) {
      return;
    }

    setIsDeletingFlow(true);

    try {
      const tx = await editFlow(
        distributionSuperToken,
        FLOW_STATE_RECEIVER,
        flowRateToReceiver,
        "0",
      ).exec(ethersSigner);

      await tx.wait();

      setSuccess(true);
    } catch (err) {
      console.error(err);
    }

    setIsDeletingFlow(false);
  };

  return (
    <Stack direction="vertical">
      <Stack direction="horizontal" className="justify-content-between">
        <Card.Text className="fs-3 mb-0">Open Flow</Card.Text>
        {!isMobile && (
          <Button
            variant="transparent"
            onClick={handleClose}
            className="p-0 float-end"
          >
            <Image src="/close.svg" alt="" width={24} height={24} />
          </Button>
        )}
      </Stack>
      <Stack
        direction="horizontal"
        gap={3}
        className="mt-2 align-items-center lh-sm"
      >
        <Image src="/sup.svg" alt="SUP" width={36} height={36} />
        <Card.Text>
          Did you know that donation streams to Flow State{" "}
          <Card.Link href="https://claim.superfluid.org/claim" target="_blank">
            earn $SUP
          </Card.Link>
          ? Claim your reward stream increase daily.
        </Card.Text>
      </Stack>
      <Stack direction="vertical" gap={2} className="my-4">
        <Dropdown>
          <Dropdown.Toggle
            className="d-flex justify-content-between align-items-center w-100 bg-white text-dark"
            style={{ border: "1px solid #dee2e6" }}
          >
            {network.name}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {networks.map((network, i) => (
              <Dropdown.Item
                key={i}
                onClick={() => {
                  router.push(`/core/?chainId=${network.id}`);
                }}
              >
                {network.name}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Dropdown>
          <Dropdown.Toggle
            className="d-flex justify-content-between align-items-center w-100 bg-white text-dark"
            style={{ border: "1px solid #dee2e6" }}
          >
            {token.symbol}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {network.tokens.map((token, i) => (
              <Dropdown.Item
                key={i}
                onClick={() => {
                  selectToken(token);
                }}
              >
                {token.symbol}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      <Card.Text className="m-0">
        Flow Rate ({token?.symbol ?? "N/A"})
      </Card.Text>
      <Stack
        direction="horizontal"
        gap={2}
        className="align-items-start bg-light mt-2 p-3 rounded-4"
      >
        <Stack direction="vertical" className="w-50">
          <Form.Control
            type="text"
            placeholder="0"
            value={amountPerTimeInterval}
            onChange={handleAmountSelection}
          />
          <Stack
            direction="horizontal"
            gap={1}
            className="position-relative justify-content-center mt-1"
          >
            <Card.Text
              className={`m-0 ${!hasSufficientSuperTokenBalance ? "text-danger" : "text-info"}`}
              style={{
                fontSize: "0.8rem",
              }}
            >
              {token.symbol}:{" "}
              {formatNumber(Number(formatEther(superTokenBalance)))}
            </Card.Text>
            {!isSuperTokenPure &&
              !showWrappingStep &&
              hasSufficientSuperTokenBalance && (
                <span
                  className="position-absolute end-0 me-2 bg-primary px-1 rounded-1 text-white cursor-pointer"
                  style={{
                    fontSize: "0.6rem",
                  }}
                  onClick={() => setShowWrappingStep(true)}
                >
                  +
                </span>
              )}
          </Stack>
        </Stack>
        <Dropdown className="w-50">
          <Dropdown.Toggle
            className="d-flex justify-content-between align-items-center w-100 bg-white text-dark"
            style={{ border: "1px solid #dee2e6" }}
          >
            {timeInterval}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {Object.values(TimeInterval).map((timeInterval, i) => (
              <Dropdown.Item
                key={i}
                onClick={() => {
                  setNewFlowRate(
                    parseEther(amountPerTimeInterval) /
                      BigInt(
                        fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]),
                      ),
                  );

                  setTimeInterval(timeInterval);
                }}
              >
                {timeInterval}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      </Stack>
      {isAmountInsufficient && (
        <Alert variant="warning" className="mt-2 mb-0 py-2">
          Minimum Donation = {minDonationPerMonth} {token.symbol}/mo
        </Alert>
      )}
      {!isSuperTokenPure && showWrappingStep && !isAmountInsufficient && (
        <>
          <Card.Text className="mt-3 mb-2">
            Wrap for Streaming (
            {isSuperTokenNative
              ? ethBalance?.symbol
              : underlyingTokenBalance?.symbol}{" "}
            to {token?.symbol ?? "N/A"})
          </Card.Text>
          <Stack direction="vertical" className="bg-light p-3 rounded-4">
            <Stack direction="horizontal" gap={2} className="align-items-start">
              <Stack direction="vertical" className="w-50">
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="0"
                    value={wrapAmountPerTimeInterval}
                    className="border-end-0"
                    onChange={handleWrapAmountSelection}
                  />
                  <InputGroup.Text className="bg-white small">
                    {isSuperTokenNative
                      ? ethBalance?.symbol
                      : underlyingTokenBalance?.symbol}
                  </InputGroup.Text>
                </InputGroup>
              </Stack>
              <span style={{ marginTop: 7 }}>=</span>
              <Stack direction="vertical" className="w-50">
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="0"
                    value={wrapTimeInterval}
                    className="border-end-0"
                    onChange={handleWrapTimeIntervalSelection}
                  />
                  <InputGroup.Text className="bg-white small">
                    {`${unitOfTime[timeInterval].charAt(0).toUpperCase()}${unitOfTime[timeInterval].slice(1)}`}
                  </InputGroup.Text>
                </InputGroup>
              </Stack>
            </Stack>
            {hasSufficientWrappingBalance ? (
              <Card.Text
                className="mt-1 mb-0 w-50 text-info text-center"
                style={{
                  fontSize: "0.8rem",
                }}
              >
                {isSuperTokenNative
                  ? ethBalance?.symbol
                  : underlyingTokenBalance?.symbol}
                :{" "}
                {formatNumber(
                  Number(
                    isSuperTokenNative
                      ? ethBalance?.formatted
                      : underlyingTokenBalance?.formatted,
                  ),
                )}
              </Card.Text>
            ) : (
              <Card.Text
                className="mt-1 mb-0 ms-2 ps-1 text-danger w-100 float-start text-nowrap"
                style={{
                  fontSize: "0.8rem",
                }}
              >
                {isSuperTokenNative
                  ? ethBalance?.symbol
                  : underlyingTokenBalance?.symbol}
                :{" "}
                {formatNumber(
                  Number(
                    isSuperTokenNative
                      ? ethBalance?.formatted
                      : underlyingTokenBalance?.formatted,
                  ),
                )}{" "}
                (Insufficient Balance)
              </Card.Text>
            )}
          </Stack>
        </>
      )}
      <Button
        disabled={!canSubmit}
        className="w-100 mt-4"
        onClick={handleSubmit}
      >
        {isDeletingFlow ? (
          <Spinner size="sm" />
        ) : areTransactionsLoading ? (
          <>
            <Spinner size="sm" />{" "}
            {transactions.length > 1 && (
              <>
                ({completedTransactions + 1}/{transactions.length})
              </>
            )}
          </>
        ) : canSubmit && transactions.length > 1 ? (
          <>Submit ({transactions.length})</>
        ) : (
          <>Submit</>
        )}
      </Button>
      {Number(flowRateToReceiver) > 0 && (
        <Button
          variant="transparent"
          className="w-100 text-primary text-decoration-underline border-0"
          style={{ pointerEvents: isDeletingFlow ? "none" : "auto" }}
          onClick={handleDeleteFlow}
        >
          Cancel stream
        </Button>
      )}
      <Toast
        show={success}
        delay={4000}
        autohide={true}
        onClose={() => setSuccess(false)}
        className="w-100 bg-success mt-3 p-3 fs-5 text-light"
      >
        Success!
      </Toast>
      {!!transactionError && (
        <Alert variant="danger" className="w-100 mt-3 p-3 fs-5">
          {transactionError}
        </Alert>
      )}
      {(accountTokenSnapshot &&
        accountTokenSnapshot.totalNetFlowRate !== "0") ||
      (newFlowRate !== BigInt(0) &&
        (superTokenBalance > 0 || wrapAmountPerTimeInterval > "0")) ? (
        <>
          <Card.Text className="mt-4 mb-2">
            Your {token.symbol} Balance Over Time
          </Card.Text>
          <BalancePlot
            flowInfo={
              areTransactionsLoading && balancePlotFlowInfoSnapshot?.current
                ? balancePlotFlowInfoSnapshot.current
                : balancePlotFlowInfo
            }
          />
        </>
      ) : null}
    </Stack>
  );
}
