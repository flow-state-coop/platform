"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import dayjs from "dayjs";
import { useQuery, gql } from "@apollo/client";
import {
  NativeAssetSuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import { usePostHog } from "posthog-js/react";
import duration from "dayjs/plugin/duration";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Offcanvas from "react-bootstrap/Offcanvas";
import Image from "react-bootstrap/Image";
import { Step } from "@/types/checkout";
import EditStream from "@/components/checkout/EditStream";
import TopUp from "@/components/checkout/TopUp";
import Wrap from "@/components/checkout/Wrap";
import FlowStateCoreGraph from "@/components/FlowStateCoreGraph";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import FlowStateCoreDetails from "@/components/FlowStateCoreDetails";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { getApolloClient } from "@/lib/apollo";
import { networks } from "@/lib/networks";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

type FlowStateCoreProps = { chainId: number };

const FLOW_STATE_CORE_QUERY = gql`
  query FlowStateCoreQuery($gdaPool: String!, $userAddress: String!) {
    pool(id: $gdaPool) {
      id
      flowRate
      adjustmentFlowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
      totalUnits
      token {
        id
      }
      poolMembers {
        account {
          id
        }
        units
      }
      poolDistributors(where: { flowRate_not: "0" }) {
        account {
          id
        }
        flowRate
        totalAmountFlowedDistributedUntilUpdatedAt
        updatedAtTimestamp
      }
    }
    account(id: $userAddress) {
      accountTokenSnapshots {
        totalNetFlowRate
        totalOutflowRate
        totalDeposit
        maybeCriticalAtTimestamp
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
        streamedUntilUpdatedAt
        updatedAtTimestamp
        currentFlowRate
      }
    }
  }
`;

dayjs().format();
dayjs.extend(duration);

export default function FlowStateCore(props: FlowStateCoreProps) {
  const { chainId } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);
  const [showTransactionPanel, setShowTransactionPanel] = useState(false);

  const network =
    networks.find((network) => network.id === chainId) ?? networks[0];
  const { isMobile, isTablet } = useMediaQuery();
  const { address } = useAccount();
  const postHog = usePostHog();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: ethBalance } = useBalance({
    address,
    chainId,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: superfluidQueryRes } = useQuery(FLOW_STATE_CORE_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: {
      gdaPool: network.flowStateCoreGda.toLowerCase(),
      userAddress: address?.toLowerCase() ?? "",
    },
    pollInterval: 10000,
  });
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });

  const userAccountSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots?.find(
      (snapshot: { token: { id: string } }) =>
        snapshot.token.id === network.tokens[0].address.toLowerCase(),
    ) ?? null;
  const superTokenBalance = useFlowingAmount(
    BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? 0),
    userAccountSnapshot?.updatedAtTimestamp ?? 0,
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0),
  );
  const minEthBalance = 0.0005;
  const suggestedTokenBalance = newFlowRate
    ? BigInt(newFlowRate) * BigInt(SECONDS_IN_MONTH) * BigInt(3)
    : BigInt(0);
  const hasSufficientEthBalance =
    ethBalance && ethBalance.value > parseEther(minEthBalance.toString())
      ? true
      : false;
  const hasSuggestedTokenBalance = superTokenBalance > suggestedTokenBalance;
  const hasSufficientTokenBalance =
    (ethBalance && ethBalance.value + superTokenBalance > BigInt(0)) ||
    superTokenBalance > BigInt(0)
      ? true
      : false;

  const flowRateToReceiver = useMemo(() => {
    if (address && superfluidQueryRes?.pool) {
      const distributor = superfluidQueryRes.pool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return distributor.flowRate;
      }
    }

    return "0";
  }, [address, superfluidQueryRes]);

  const calcLiquidationEstimate = useCallback(
    (amountPerTimeInterval: string) => {
      if (address) {
        const newFlowRate =
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));
        const accountFlowRate = userAccountSnapshot?.totalNetFlowRate ?? "0";

        if (
          BigInt(-accountFlowRate) -
            BigInt(flowRateToReceiver) +
            BigInt(newFlowRate) >
          BigInt(0)
        ) {
          const updatedAtTimestamp = userAccountSnapshot
            ? userAccountSnapshot.updatedAtTimestamp * 1000
            : Date.now();
          const date = dayjs(new Date(updatedAtTimestamp));

          return date
            .add(
              dayjs.duration({
                seconds: Number(
                  (BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? "0") +
                    parseEther(wrapAmount?.replace(/,/g, "") ?? "0")) /
                    (BigInt(-accountFlowRate) -
                      BigInt(flowRateToReceiver) +
                      BigInt(newFlowRate)),
                ),
              }),
            )
            .unix();
        }
      }

      return null;
    },
    [userAccountSnapshot, address, wrapAmount, flowRateToReceiver],
  );

  const liquidationEstimate = useMemo(
    () => calcLiquidationEstimate(amountPerTimeInterval),
    [calcLiquidationEstimate, amountPerTimeInterval],
  );

  useEffect(() => {
    (async () => {
      if (!address || !newFlowRate || !ethersProvider || !ethersSigner) {
        return;
      }

      const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
      const transactions: (() => Promise<void>)[] = [];
      const operations: Operation[] = [];

      const sfFramework = await Framework.create({
        chainId: network.id,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const superToken = await sfFramework.loadSuperToken("ETHx");

      if (wrapAmount && Number(wrapAmount?.replace(/,/g, "")) > 0) {
        transactions.push(async () => {
          const tx = await (superToken as NativeAssetSuperToken)
            .upgrade({
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);

          await tx.wait();
        });
      }

      operations.push(
        superToken.distributeFlow({
          from: address,
          pool: network.flowStateCoreGda,
          requestedFlowRate: newFlowRate,
        }),
      );

      transactions.push(async () => {
        const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

        await tx.wait();
      });

      setTransactions(transactions);
    })();
  }, [address, network, wrapAmount, newFlowRate, ethersProvider, ethersSigner]);

  const graphComponentKey = useMemo(
    () => `${superfluidQueryRes?.pool.id ?? ""}-${Date.now()}`,
    [superfluidQueryRes?.pool],
  );

  useEffect(() => {
    (async () => {
      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
        4,
      );

      setAmountPerTimeInterval(
        formatNumberWithCommas(parseFloat(currentStreamValue)),
      );
    })();
  }, [address, flowRateToReceiver]);

  useEffect(() => {
    if (!areTransactionsLoading && amountPerTimeInterval) {
      setNewFlowRate(
        (
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]))
        ).toString(),
      );
    }
  }, [areTransactionsLoading, amountPerTimeInterval]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      postHog.startSessionRecording();
    }
  }, [postHog, postHog.decideEndpointWasHit]);

  const updateWrapAmount = (
    amountPerTimeInterval: string,
    liquidationEstimate: number | null,
  ) => {
    if (amountPerTimeInterval) {
      const weiAmount = parseEther(amountPerTimeInterval.replace(/,/g, ""));

      if (
        weiAmount > 0 &&
        liquidationEstimate &&
        dayjs
          .unix(liquidationEstimate)
          .isBefore(dayjs().add(dayjs.duration({ months: 3 })))
      ) {
        if (ethBalance?.value && ethBalance.value <= weiAmount * BigInt(3)) {
          const amount =
            ethBalance.value - parseEther(minEthBalance.toString());

          setWrapAmount(
            formatNumberWithCommas(
              parseFloat(formatEther(amount > 0 ? BigInt(amount) : BigInt(0))),
            ),
          );
        } else {
          setWrapAmount(
            formatNumberWithCommas(
              parseFloat(formatEther(weiAmount * BigInt(3))),
            ),
          );
        }
      } else {
        setWrapAmount("");
      }

      setNewFlowRate(
        (
          weiAmount /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]))
        ).toString(),
      );
    }
  };

  return (
    <>
      {!network ? (
        <Stack direction="horizontal" className="m-auto fs-1 fs-bold">
          Network not supported
        </Stack>
      ) : (
        <Stack
          direction="horizontal"
          className="align-items-stretch flex-grow-1 overflow-hidden"
          style={{ height: "100vh" }}
        >
          <FlowStateCoreGraph
            key={graphComponentKey}
            pool={superfluidQueryRes?.pool}
            chainId={chainId}
          />
          {!isMobile && !isTablet ? (
            <Stack
              direction="vertical"
              className="w-25 p-3 mx-auto me-0 overflow-y-auto"
              style={{
                minHeight: "100svh",
                boxShadow: "-0.4rem 0 0.4rem 1px rgba(0,0,0,0.1)",
              }}
            >
              <p className="m-0 fs-4">Fund Flow State</p>
              <Stack direction="vertical" className="flex-grow-0">
                <FlowStateCoreDetails matchingPool={superfluidQueryRes?.pool} />
                <Accordion activeKey={step} className="mt-4">
                  <EditStream
                    isSelected={step === Step.SELECT_AMOUNT}
                    setStep={(step) => setStep(step)}
                    token={network.tokens[0]}
                    network={network}
                    flowRateToReceiver={flowRateToReceiver}
                    amountPerTimeInterval={amountPerTimeInterval}
                    setAmountPerTimeInterval={(amount) => {
                      setAmountPerTimeInterval(amount);
                      updateWrapAmount(amount, calcLiquidationEstimate(amount));
                    }}
                    newFlowRate={newFlowRate}
                    wrapAmount={wrapAmount}
                    isFundingFlowStateCore={true}
                    superTokenBalance={superTokenBalance}
                    hasSufficientBalance={
                      !!hasSufficientEthBalance && !!hasSuggestedTokenBalance
                    }
                  />
                  <TopUp
                    step={step}
                    setStep={(step) => setStep(step)}
                    newFlowRate={newFlowRate}
                    wrapAmount={wrapAmount}
                    isFundingFlowStateCore={true}
                    superTokenBalance={superTokenBalance}
                    minEthBalance={minEthBalance}
                    suggestedTokenBalance={suggestedTokenBalance}
                    hasSufficientEthBalance={hasSufficientEthBalance}
                    hasSufficientTokenBalance={hasSufficientTokenBalance}
                    hasSuggestedTokenBalance={hasSuggestedTokenBalance}
                    ethBalance={ethBalance}
                    underlyingTokenBalance={ethBalance}
                    network={network}
                    superTokenInfo={network.tokens[0]}
                  />
                  <Wrap
                    step={step}
                    setStep={setStep}
                    wrapAmount={wrapAmount}
                    setWrapAmount={setWrapAmount}
                    newFlowRate={newFlowRate}
                    token={network.tokens[0]}
                    isFundingFlowStateCore={true}
                    superTokenBalance={superTokenBalance}
                    underlyingTokenBalance={ethBalance}
                  />
                  <Review
                    step={step}
                    setStep={(step) => setStep(step)}
                    network={network}
                    receiver={network.flowStateCoreGda}
                    transactions={transactions}
                    completedTransactions={completedTransactions}
                    areTransactionsLoading={areTransactionsLoading}
                    transactionError={transactionError}
                    executeTransactions={executeTransactions}
                    liquidationEstimate={liquidationEstimate}
                    netImpact={BigInt(0)}
                    matchingTokenInfo={network.tokens[0]}
                    allocationTokenInfo={network.tokens[0]}
                    flowRateToReceiver={flowRateToReceiver}
                    amountPerTimeInterval={amountPerTimeInterval}
                    newFlowRate={newFlowRate}
                    wrapAmount={wrapAmount}
                    newFlowRateToFlowState={"0"}
                    flowRateToFlowState={"0"}
                    supportFlowStateAmount={"0"}
                    supportFlowStateTimeInterval={TimeInterval.MONTH}
                    isFundingFlowStateCore={true}
                    isPureSuperToken={false}
                    superTokenBalance={superTokenBalance}
                    underlyingTokenBalance={ethBalance}
                  />
                  <Success
                    step={step}
                    isFundingFlowStateCore={true}
                    poolName="Flow State Core"
                    poolUiLink="https://flowstate.network/core"
                    newFlowRate={newFlowRate}
                  />
                </Accordion>
              </Stack>
            </Stack>
          ) : (
            <Offcanvas
              show={showTransactionPanel}
              placement="bottom"
              onHide={() => setShowTransactionPanel(false)}
              className="h-100"
            >
              <Offcanvas.Header closeButton className="fs-4 pb-2">
                Fund Flow State
              </Offcanvas.Header>
              <Offcanvas.Body>
                <Stack direction="vertical" className="flex-grow-0">
                  <FlowStateCoreDetails
                    matchingPool={superfluidQueryRes?.pool}
                  />
                  <Accordion activeKey={step} className="mt-4">
                    <EditStream
                      isSelected={step === Step.SELECT_AMOUNT}
                      setStep={(step) => setStep(step)}
                      token={network.tokens[0]}
                      network={network}
                      flowRateToReceiver={flowRateToReceiver}
                      amountPerTimeInterval={amountPerTimeInterval}
                      setAmountPerTimeInterval={(amount) => {
                        setAmountPerTimeInterval(amount);
                        updateWrapAmount(
                          amount,
                          calcLiquidationEstimate(amount),
                        );
                      }}
                      newFlowRate={newFlowRate}
                      wrapAmount={wrapAmount}
                      isFundingFlowStateCore={true}
                      superTokenBalance={superTokenBalance}
                      hasSufficientBalance={
                        !!hasSufficientEthBalance && !!hasSuggestedTokenBalance
                      }
                    />
                    <TopUp
                      step={step}
                      setStep={(step) => setStep(step)}
                      newFlowRate={newFlowRate}
                      wrapAmount={wrapAmount}
                      isFundingFlowStateCore={true}
                      superTokenBalance={superTokenBalance}
                      minEthBalance={minEthBalance}
                      suggestedTokenBalance={suggestedTokenBalance}
                      hasSufficientEthBalance={hasSufficientEthBalance}
                      hasSufficientTokenBalance={hasSufficientTokenBalance}
                      hasSuggestedTokenBalance={hasSuggestedTokenBalance}
                      ethBalance={ethBalance}
                      underlyingTokenBalance={ethBalance}
                      network={network}
                      superTokenInfo={network.tokens[0]}
                    />
                    <Wrap
                      step={step}
                      setStep={setStep}
                      wrapAmount={wrapAmount}
                      setWrapAmount={setWrapAmount}
                      newFlowRate={newFlowRate}
                      token={network.tokens[0]}
                      isFundingFlowStateCore={true}
                      superTokenBalance={superTokenBalance}
                      underlyingTokenBalance={ethBalance}
                    />
                    <Review
                      step={step}
                      setStep={(step) => setStep(step)}
                      network={network}
                      receiver={network.flowStateCoreGda}
                      transactions={transactions}
                      completedTransactions={completedTransactions}
                      areTransactionsLoading={areTransactionsLoading}
                      transactionError={transactionError}
                      executeTransactions={executeTransactions}
                      liquidationEstimate={liquidationEstimate}
                      netImpact={BigInt(0)}
                      matchingTokenInfo={network.tokens[0]}
                      allocationTokenInfo={network.tokens[0]}
                      flowRateToReceiver={flowRateToReceiver}
                      amountPerTimeInterval={amountPerTimeInterval}
                      newFlowRate={newFlowRate}
                      wrapAmount={wrapAmount}
                      newFlowRateToFlowState={"0"}
                      flowRateToFlowState={"0"}
                      supportFlowStateAmount={"0"}
                      supportFlowStateTimeInterval={TimeInterval.MONTH}
                      isFundingFlowStateCore={true}
                      isPureSuperToken={false}
                      superTokenBalance={superTokenBalance}
                      underlyingTokenBalance={ethBalance}
                    />
                    <Success
                      step={step}
                      isFundingFlowStateCore={true}
                      poolName="Flow State Core"
                      poolUiLink="https://flowstate.network/core"
                      newFlowRate={newFlowRate}
                    />
                  </Accordion>
                </Stack>
              </Offcanvas.Body>
            </Offcanvas>
          )}
        </Stack>
      )}
      <Button
        onClick={() => setShowTransactionPanel(true)}
        className="d-lg-none position-absolute bottom-0 end-0 me-4 mb-3 p-0 rounded-circle"
        style={{ width: 64, height: 64 }}
      >
        <Image
          src="/add.svg"
          alt="Open"
          width={38}
          height={38}
          style={{
            filter:
              "invert(100%) sepia(0%) saturate(0%) hue-rotate(49deg) brightness(103%) contrast(103%)",
          }}
        />
      </Button>
    </>
  );
}
