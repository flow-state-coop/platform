import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Address,
  isAddress,
  parseEther,
  parseUnits,
  formatEther,
  encodeFunctionData,
  erc20Abi,
} from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useQuery, gql } from "@apollo/client";
import { superTokenAbi } from "@sfpro/sdk/abi";
import { gdaForwarderAbi, gdaForwarderAddress } from "@sfpro/sdk/abi";
import { hostAbi, hostAddress, gdaAbi, gdaAddress } from "@sfpro/sdk/abi/core";
import { prepareOperation, OPERATION_TYPE } from "@sfpro/sdk/constant";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Image from "react-bootstrap/Image";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import FormCheckInput from "react-bootstrap/FormCheckInput";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Toast from "react-bootstrap/Toast";
import InputGroup from "react-bootstrap/InputGroup";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { GDAPool } from "@/types/gdaPool";
import { TransactionCall } from "@/types/transactionCall";
import BalancePlot, { BalancePlotFlowInfo } from "./BalancePlot";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useSuperTokenType from "@/hooks/superTokenType";
import { getApolloClient } from "@/lib/apollo";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  isNumber,
  formatNumber,
} from "@/lib/utils";
import { MAX_FLOW_RATE } from "@/lib/constants";

dayjs.extend(duration);

type OpenFlowProps = {
  show: boolean;
  network: Network;
  token: Token;
  pool?: GDAPool;
  handleClose: () => void;
};

const ACCOUNT_TOKEN_SNAPSHOT_QUERY = gql`
  query AccountTokenSnapshot($address: String, $token: String) {
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
    }
  }
`;

export default function OpenFlow(props: OpenFlowProps) {
  const { show, network, token, pool, handleClose } = props;

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
  const [isDeletingFlow, setIsDeletingFlow] = useState(false);
  const [
    hasAcceptedCloseLiquidationWarning,
    setHasAcceptedCloseLiquidationWarning,
  ] = useState(false);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    shouldUseSendCalls,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: superfluidQueryRes } = useQuery(ACCOUNT_TOKEN_SNAPSHOT_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      address: address?.toLowerCase() ?? "",
      token: token?.address.toLowerCase() ?? "",
    },
    pollInterval: 10000,
    skip: !address || !token,
  });
  const accountTokenSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots[0] ?? null;
  const poolMemberships = superfluidQueryRes?.account?.poolMemberships ?? null;
  const { balanceUntilUpdatedAt, updatedAtTimestamp } =
    useSuperTokenBalanceOfNow({
      token: token?.address,
      address,
      chainId: network.id,
    });
  const superTokenBalance = useFlowingAmount(
    BigInt(balanceUntilUpdatedAt ?? 0),
    updatedAtTimestamp ?? 0,
    BigInt((updatedAtTimestamp && accountTokenSnapshot?.totalNetFlowRate) ?? 0),
  );
  const {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress: tokenUnderlyingAddress,
  } = useSuperTokenType(token.address, network.id);
  const { data: ethBalance } = useBalance({
    address,
    chainId: network?.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: isSuperTokenNative ? void 0 : (tokenUnderlyingAddress as Address),
    chainId: network.id,
    query: {
      refetchInterval: 10000,
      enabled: isSuperTokenWrapper === true,
    },
  });
  const { data: underlyingTokenAllowance } = useReadContract({
    address: tokenUnderlyingAddress as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, token.address],
    chainId: network.id,
    query: {
      enabled: isSuperTokenWrapper === true && !!address,
      refetchInterval: 10000,
    },
  });

  const hasSufficientSuperTokenBalance =
    superTokenBalance > BigInt(0) ? true : false;
  const hasSufficientWrappingBalance =
    (isSuperTokenNative &&
      ethBalance &&
      ethBalance.value >= parseEther(wrapAmountPerTimeInterval ?? 0)) ||
    (underlyingTokenBalance &&
      underlyingTokenBalance.value >=
        parseUnits(
          wrapAmountPerTimeInterval,
          underlyingTokenBalance.decimals,
        )) ||
    isSuperTokenPure
      ? true
      : false;

  const flowRateToReceiver = useMemo(() => {
    if (address && pool) {
      const distributor = pool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return distributor.flowRate;
      }
    }

    return "0";
  }, [address, pool]);

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

  const liquidationEstimate = useMemo(
    () => calcLiquidationEstimate(newFlowRate, wrapAmountPerTimeInterval),
    [newFlowRate, wrapAmountPerTimeInterval, calcLiquidationEstimate],
  );

  const isLiquidationClose = useMemo(
    () =>
      liquidationEstimate
        ? dayjs
            .unix(liquidationEstimate)
            .isBefore(dayjs().add(dayjs.duration({ days: 2 })))
        : false,
    [liquidationEstimate],
  );

  const canSubmit = useMemo(
    () =>
      (newFlowRate > 0 || BigInt(flowRateToReceiver) > 0) &&
      BigInt(flowRateToReceiver) !== newFlowRate &&
      ((hasSufficientSuperTokenBalance && hasSufficientWrappingBalance) ||
        (wrapAmountPerTimeInterval &&
          Number(wrapAmountPerTimeInterval) > 0 &&
          hasSufficientWrappingBalance)),
    [
      newFlowRate,
      flowRateToReceiver,
      hasSufficientSuperTokenBalance,
      hasSufficientWrappingBalance,
      wrapAmountPerTimeInterval,
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
    if (address && flowRateToReceiver) {
      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToReceiver) *
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH])),
        4,
      );

      setAmountPerTimeInterval(currentStreamValue);
      setNewFlowRate(BigInt(flowRateToReceiver));
    }
  }, [address, flowRateToReceiver]);

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

  const calls = useMemo(() => {
    if (
      !address ||
      !pool ||
      !isAddress(pool.id) ||
      isSuperTokenWrapper === undefined
    ) {
      return [];
    }

    const chainId = network.id as keyof typeof hostAddress;
    const wrapAmountWei = parseEther(wrapAmountPerTimeInterval);
    const wrapAmountUnits = parseUnits(
      wrapAmountPerTimeInterval,
      underlyingTokenBalance?.decimals ?? 18,
    );
    const needsApproval =
      isSuperTokenWrapper &&
      wrapAmountUnits > BigInt(underlyingTokenAllowance ?? 0);
    const newCalls: TransactionCall[] = [];
    const batchOps: {
      operationType: number;
      target: Address;
      data: `0x${string}`;
    }[] = [];

    if (!isSuperTokenPure && wrapAmountWei > 0) {
      if (isSuperTokenWrapper && tokenUnderlyingAddress && needsApproval) {
        newCalls.push({
          to: tokenUnderlyingAddress as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [token.address, wrapAmountUnits],
          }),
        });
      }

      if (isSuperTokenWrapper) {
        batchOps.push(
          prepareOperation({
            operationType: OPERATION_TYPE.SUPERTOKEN_UPGRADE,
            target: token.address,
            data: encodeFunctionData({
              abi: superTokenAbi,
              functionName: "upgrade",
              args: [wrapAmountWei],
            }),
          }),
        );
      } else if (isSuperTokenNative) {
        newCalls.push({
          to: token.address,
          data: encodeFunctionData({
            abi: superTokenAbi,
            functionName: "upgradeByETH",
            args: [],
          }),
          value: wrapAmountWei,
        });
      }
    }

    batchOps.push(
      prepareOperation({
        operationType: OPERATION_TYPE.SUPERFLUID_CALL_AGREEMENT,
        target: gdaAddress[chainId],
        data: encodeFunctionData({
          abi: gdaAbi,
          functionName: "distributeFlow",
          args: [token.address, address, pool.id as Address, newFlowRate, "0x"],
        }),
      }),
    );

    newCalls.push({
      to: hostAddress[chainId],
      data: encodeFunctionData({
        abi: hostAbi,
        functionName: "batchCall",
        args: [batchOps],
      }),
    });

    return newCalls;
  }, [
    address,
    wrapAmountPerTimeInterval,
    pool,
    newFlowRate,
    underlyingTokenBalance,
    underlyingTokenAllowance,
    isSuperTokenPure,
    isSuperTokenWrapper,
    isSuperTokenNative,
    tokenUnderlyingAddress,
    network.id,
    token.address,
  ]);

  const handleAmountSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;

    if (isNumber(value)) {
      const newFlowRate =
        parseEther(value) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]));

      if (newFlowRate < MAX_FLOW_RATE) {
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

  const handleDeleteFlow = async () => {
    if (!address || !pool || !isAddress(pool.id)) {
      return;
    }

    const chainId = network.id as keyof typeof gdaForwarderAddress;

    setIsDeletingFlow(true);

    try {
      await executeTransactions([
        {
          to: gdaForwarderAddress[chainId],
          data: encodeFunctionData({
            abi: gdaForwarderAbi,
            functionName: "distributeFlow",
            args: [token.address, address, pool.id as Address, BigInt(0), "0x"],
          }),
        },
      ]);

      setSuccess(true);
    } catch (err) {
      console.error(err);
    }

    setIsDeletingFlow(false);
  };

  const handleSubmit = async () => {
    try {
      await executeTransactions(calls);

      setSuccess(true);
      setWrapAmountPerTimeInterval("");
      setTimeInterval(TimeInterval.MONTH);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Offcanvas
      show={show}
      onHide={handleClose}
      placement={isMobile ? "bottom" : "end"}
      className={`${isMobile ? "w-100 h-100" : ""}`}
    >
      <Offcanvas.Header className="align-items-start">
        <Stack direction="vertical">
          <Offcanvas.Title className="fs-5 mb-0 px-4">
            Open Flow
          </Offcanvas.Title>
          <Card.Text className="mt-2 mb-0 px-4">
            Set the rate at which you want to stream to the Flow Splitter. The
            Splitter will dynamically allocate all incoming streams to the
            recipients based on their shares.
          </Card.Text>
        </Stack>
        <Button variant="transparent" className="p-0" onClick={handleClose}>
          <Image src="/close.svg" alt="Close" width={24} height={24} />
        </Button>
      </Offcanvas.Header>
      <Offcanvas.Body className="p-4">
        <Card.Text className="m-0">
          Flow Rate ({token?.symbol ?? "N/A"})
        </Card.Text>
        <Stack
          direction="horizontal"
          gap={2}
          className="align-items-start bg-lace-100 mt-2 p-4 rounded-4"
        >
          <Stack direction="vertical" className="w-50">
            <Form.Control
              type="text"
              placeholder="0"
              value={amountPerTimeInterval}
              className="border-0 fw-semi-bold"
              onChange={handleAmountSelection}
            />
            <Stack
              direction="horizontal"
              gap={1}
              className="position-relative mt-2 ms-3"
            >
              <Card.Text
                className={`m-0 ${!hasSufficientSuperTokenBalance && Number(amountPerTimeInterval) > 0 ? "text-danger" : "text-info"}`}
                style={{
                  fontSize: "0.8rem",
                }}
              >
                {token.symbol}:{" "}
                {formatNumber(Number(formatEther(superTokenBalance)))}{" "}
                {!hasSufficientSuperTokenBalance &&
                Number(amountPerTimeInterval) > 0
                  ? "(Wrap below)"
                  : null}
              </Card.Text>
              {!isSuperTokenPure &&
                !showWrappingStep &&
                hasSufficientSuperTokenBalance && (
                  <span
                    className="position-absolute end-0 me-2 bg-primary p-1 rounded-1 text-white cursor-pointer"
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
              className="d-flex justify-content-between align-items-center w-100 border-0 bg-white fw-semi-bold py-2 text-dark"
              style={{ border: "1px solid #dee2e6" }}
            >
              {timeInterval}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {Object.values(TimeInterval).map((timeInterval, i) => (
                <Dropdown.Item
                  key={i}
                  className="fw-semi-bold"
                  onClick={() => {
                    const newFlowRate =
                      parseEther(amountPerTimeInterval) /
                      BigInt(
                        fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]),
                      );

                    if (newFlowRate < MAX_FLOW_RATE) {
                      setNewFlowRate(newFlowRate);
                    }

                    setTimeInterval(timeInterval);
                  }}
                >
                  {timeInterval}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </Stack>
        {!isSuperTokenPure && showWrappingStep && (
          <>
            <Card.Text className="mt-5 mb-2">
              Wrap for Streaming (
              {isSuperTokenNative
                ? ethBalance?.symbol
                : underlyingTokenBalance?.symbol}{" "}
              to {token?.symbol ?? "N/A"})
            </Card.Text>
            <Stack direction="vertical" className="bg-lace-100 p-4 rounded-4">
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-start"
              >
                <Stack direction="vertical" className="w-50">
                  <InputGroup>
                    <Form.Control
                      type="text"
                      placeholder="0"
                      value={wrapAmountPerTimeInterval}
                      className="border-0 fw-semi-bold"
                      onChange={handleWrapAmountSelection}
                    />
                    <InputGroup.Text className="bg-white small border-0 fw-semi-bold">
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
                      className="border-0 fw-semi-bold"
                      onChange={handleWrapTimeIntervalSelection}
                    />
                    <InputGroup.Text className="bg-white small border-0 fw-semi-bold">
                      {`${unitOfTime[timeInterval].charAt(0).toUpperCase()}${unitOfTime[timeInterval].slice(1)}`}
                    </InputGroup.Text>
                  </InputGroup>
                </Stack>
              </Stack>
              {!hasSufficientWrappingBalance ? (
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
              ) : (
                <Card.Text
                  className="ms-3 mt-1 mb-0 w-50 text-info"
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
              )}
            </Stack>
          </>
        )}
        <Stack direction="vertical" className="mt-2">
          {canSubmit &&
            !!liquidationEstimate &&
            !isNaN(liquidationEstimate) && (
              <Stack direction="horizontal" gap={1} className="mb-2">
                <OverlayTrigger
                  overlay={
                    <Tooltip id="t-liquidation-info">
                      <p className="m-0 p-2">
                        This is the current estimate for when your token balance
                        will reach 0. Make sure to close your stream or{" "}
                        {isSuperTokenPure ? "deposit" : "wrap"} more tokens
                        before this date to avoid loss of your buffer deposit.
                        See the graph below to vizualize how your proposed
                        transaction(s) will impact your balance over time.
                      </p>
                    </Tooltip>
                  }
                >
                  <Image
                    src="/info.svg"
                    alt="Liquidation info"
                    width={16}
                    height={16}
                  />
                </OverlayTrigger>
                <Card.Text className="m-0 fs-lg fw-semi-bold">
                  {isSuperTokenPure ? "Deposit" : "Wrap"} more by{" "}
                  {dayjs.unix(liquidationEstimate).format("MMMM D, YYYY")}
                </Card.Text>
              </Stack>
            )}
          {canSubmit && isLiquidationClose && (
            <Stack direction="vertical" className="mb-2">
              <Card.Text className="text-danger small">
                You've set a high stream rate relative to your balance! We
                recommend that you set a lower rate or{" "}
                {isSuperTokenPure ? "deposit" : "wrap"} more {token.symbol}.
              </Card.Text>
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-center"
              >
                <FormCheckInput
                  checked={hasAcceptedCloseLiquidationWarning}
                  className="border-black"
                  onChange={() =>
                    setHasAcceptedCloseLiquidationWarning(
                      !hasAcceptedCloseLiquidationWarning,
                    )
                  }
                />
                <Card.Text className="text-danger small">
                  If I do not cancel this stream before my balance reaches zero,
                  I will lose my 4-hour {token.symbol} deposit.
                </Card.Text>
              </Stack>
            </Stack>
          )}
          <Stack direction="vertical" className="mt-4">
            {canSubmit && (!ethBalance || ethBalance.value === BigInt(0)) && (
              <Alert variant="warning">
                No ETH balance. Proceed if your gas will be sponsored.
              </Alert>
            )}
            <Button
              disabled={
                !canSubmit ||
                (isLiquidationClose && !hasAcceptedCloseLiquidationWarning)
              }
              className="w-100 py-4 rounded-4 fs-lg fw-semi-bold"
              onClick={handleSubmit}
            >
              {areTransactionsLoading || isDeletingFlow ? (
                <>
                  <Spinner size="sm" />{" "}
                  {!shouldUseSendCalls && calls.length > 1 && (
                    <>
                      ({completedTransactions + 1}/{calls.length})
                    </>
                  )}
                </>
              ) : canSubmit && !shouldUseSendCalls && calls.length > 1 ? (
                <>Submit ({calls.length})</>
              ) : (
                <>Submit</>
              )}
            </Button>
          </Stack>
          <Stack direction="vertical">
            {BigInt(flowRateToReceiver) > 0 && (
              <Button
                variant="transparent"
                className="w-100 text-primary text-decoration-underline border-0 pb-0 fw-semi-bold"
                style={{ pointerEvents: isDeletingFlow ? "none" : "auto" }}
                onClick={handleDeleteFlow}
              >
                Cancel stream
              </Button>
            )}
          </Stack>
          <Toast
            show={success}
            delay={4000}
            autohide={true}
            onClose={() => setSuccess(false)}
            className="w-100 bg-success mt-3 p-3 fs-6 text-white fw-semi-bold"
          >
            Success!
          </Toast>
          {!!transactionError && (
            <Alert variant="danger" className="w-100 mt-3 p-3 fw-semi-bold">
              {transactionError}
            </Alert>
          )}
        </Stack>
        {(accountTokenSnapshot &&
          accountTokenSnapshot.totalNetFlowRate !== "0") ||
        (newFlowRate !== BigInt(0) &&
          (superTokenBalance > 0 || wrapAmountPerTimeInterval > "0")) ? (
          <>
            <Card.Text className="mt-6 mb-2">
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
      </Offcanvas.Body>
    </Offcanvas>
  );
}
