import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Address, parseEther, parseUnits, formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
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
import Offcanvas from "react-bootstrap/Offcanvas";
import Stack from "react-bootstrap/Stack";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Toast from "react-bootstrap/Toast";
import InputGroup from "react-bootstrap/InputGroup";
import Spinner from "react-bootstrap/Spinner";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { GDAPool } from "@/types/gdaPool";
import BalancePlot, { BalancePlotFlowInfo } from "./BalancePlot";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { getApolloClient } from "@/lib/apollo";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  roundWeiAmount,
  isNumber,
} from "@/lib/utils";
import { ZERO_ADDRESS } from "@/lib/constants";

dayjs().format();
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
    token(id: $token) {
      isNativeAssetSuperToken
      underlyingAddress
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
  const [sfFramework, setSfFramework] = useState<Framework>();
  const [distributionSuperToken, setDistributionSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken
  >();
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("");
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });
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
    },
    pollInterval: 10000,
    skip: !address || !token,
  });
  const accountTokenSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots[0] ?? null;
  const poolMemberships = superfluidQueryRes?.account?.poolMemberships ?? null;
  const { balanceUntilUpdatedAt, updatedAtTimestamp } =
    useSuperTokenBalanceOfNow({
      token: token?.address ?? "",
      address: address ?? "",
      chainId: network.id,
    });
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
    superTokenBalance > BigInt(0) ? true : false;
  const hasSufficientWrappingBalance =
    (isSuperTokenNative &&
      ethBalance &&
      ethBalance.value > parseEther(wrapAmountPerTimeInterval ?? 0)) ||
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

  const canSubmit =
    (newFlowRate > 0 || BigInt(flowRateToReceiver) > 0) &&
    BigInt(flowRateToReceiver) !== newFlowRate &&
    ((hasSufficientSuperTokenBalance && hasSufficientWrappingBalance) ||
      (wrapAmountPerTimeInterval &&
        Number(wrapAmountPerTimeInterval) > 0 &&
        hasSufficientWrappingBalance));

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

  useEffect(() => {
    (async () => {
      if (!token || !ethersProvider || !address) {
        return;
      }

      const sfFramework = await Framework.create({
        chainId: network.id,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const distributionSuperToken = await sfFramework.loadSuperToken(
        isSuperTokenNative ? "ETHx" : token.address,
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
  }, [address, network, ethersProvider, token, isSuperTokenNative]);

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !pool ||
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
                amount: parseUnits(
                  wrapAmountPerTimeInterval,
                  underlyingTokenBalance?.decimals ?? 18,
                ).toString(),
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
        distributionSuperToken.distributeFlow({
          from: address,
          pool: pool.id,
          requestedFlowRate: newFlowRate.toString(),
        }),
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
    pool,
    newFlowRate,
    underlyingTokenBalance,
    underlyingTokenAllowance,
    sfFramework,
    ethersProvider,
    ethersSigner,
    distributionSuperToken,
    isSuperTokenPure,
    isSuperTokenWrapper,
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

  return (
    <Offcanvas
      show={show}
      onHide={handleClose}
      placement={isMobile ? "bottom" : "end"}
      className={`${isMobile ? "w-100 h-100" : ""}`}
    >
      <Offcanvas.Header closeButton className="align-items-start">
        <Stack direction="vertical">
          <Offcanvas.Title className="fs-3 mb-0">Open Flow</Offcanvas.Title>
          <Card.Text className="m-0 fs-6">
            Set the rate at which you want to stream to the Flow Splitter. The
            Splitter will dynamically allocate all incoming streams to the
            recipients based on their shares.
          </Card.Text>
        </Stack>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Card.Text className="m-0">
          Flow Rate ({token?.name ?? "N/A"})
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
              className="justify-content-center mt-1"
            >
              <Card.Text
                className={`m-0 ${!hasSufficientSuperTokenBalance ? "text-danger" : "text-info"}`}
                style={{
                  fontSize: "0.8rem",
                }}
              >
                {token.name}:{" "}
                {Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(
                  Number(formatEther(superTokenBalance)),
                )}{" "}
                {!hasSufficientSuperTokenBalance &&
                Number(amountPerTimeInterval) > 0
                  ? "(Wrap below)"
                  : null}
              </Card.Text>
              {!isSuperTokenPure &&
                !showWrappingStep &&
                hasSufficientSuperTokenBalance && (
                  <span
                    className="bg-primary px-1 rounded-1 text-white cursor-pointer"
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
        {!isSuperTokenPure && showWrappingStep && (
          <>
            <Card.Text className="mt-3 mb-2">
              Wrap for Streaming (
              {isSuperTokenNative
                ? ethBalance?.symbol
                : underlyingTokenBalance?.symbol}{" "}
              to {token?.name ?? "N/A"})
            </Card.Text>
            <Stack direction="vertical" className="bg-light p-3 rounded-4">
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
              {isSuperTokenNative &&
              ethBalance &&
              wrapAmountPerTimeInterval &&
              ethBalance.value === parseEther(wrapAmountPerTimeInterval) ? (
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
                  {Intl.NumberFormat("en", {
                    maximumFractionDigits: 6,
                  }).format(
                    Number(
                      isSuperTokenNative
                        ? ethBalance?.formatted
                        : underlyingTokenBalance?.formatted,
                    ),
                  )}{" "}
                  (Leave enough for gas)
                </Card.Text>
              ) : !hasSufficientWrappingBalance ? (
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
                  {Intl.NumberFormat("en", {
                    maximumFractionDigits: 6,
                  }).format(
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
                  className="mt-1 mb-0 w-50 text-info text-center"
                  style={{
                    fontSize: "0.8rem",
                  }}
                >
                  {isSuperTokenNative
                    ? ethBalance?.symbol
                    : underlyingTokenBalance?.symbol}
                  :{" "}
                  {Intl.NumberFormat("en", {
                    maximumFractionDigits: 6,
                  }).format(
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
        <Button
          disabled={!canSubmit}
          className="w-100 mt-4"
          onClick={handleSubmit}
        >
          {areTransactionsLoading ? (
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
              Your {token.name} Balance Over Time
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
