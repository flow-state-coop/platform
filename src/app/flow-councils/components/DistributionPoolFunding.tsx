import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Address,
  isAddress,
  parseAbi,
  parseEther,
  parseUnits,
  formatUnits,
} from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import dayjs from "dayjs";
import { useQuery, gql } from "@apollo/client";
import {
  NativeAssetSuperToken,
  WrapperSuperToken,
  SuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import duration from "dayjs/plugin/duration";
import Offcanvas from "react-bootstrap/Offcanvas";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import { Step } from "@/types/checkout";
import EditStream from "@/components/checkout/EditStream";
import TopUp from "@/components/checkout/TopUp";
import Wrap from "@/components/checkout/Wrap";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import { Network } from "@/types/network";
import DistributionPoolDetails from "./DistributionPoolDetails";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useFlowCouncil from "../hooks/flowCouncil";
import useBufferContribution from "../hooks/useBufferContribution";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import { SECONDS_IN_MONTH, MAX_FLOW_RATE, ZERO_ADDRESS } from "@/lib/constants";
import { getSocialShare } from "../lib/socialShare";

const SF_ACCOUNT_QUERY = gql`
  query SFAccountQuery($userAddress: String!, $token: String!) {
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

export default function DistributionPoolFunding(props: {
  network: Network;
  hide: () => void;
}) {
  const { network, hide } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [sfFramework, setSfFramework] = useState<Framework | null>(null);
  const [superToken, setSuperToken] = useState<
    NativeAssetSuperToken | WrapperSuperToken | SuperToken | null
  >(null);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const { council, councilMetadata, token, distributionPool, superAppFunderData } =
    useFlowCouncil();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const distributionTokenAddress = token.address;
  const splitterAddress = councilMetadata.superappSplitterAddress;
  const { data: underlyingTokenAddress } = useReadContract({
    address: distributionTokenAddress,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),
    functionName: "getUnderlyingToken",
  });
  const { data: realtimeBalanceOfNow } = useReadContract({
    address: distributionTokenAddress,
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
  const { data: ethBalance } = useBalance({
    address,
    chainId: network.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const isSuperTokenNative =
    token.symbol === "ETHx" || token.symbol === "CELOx";
  const isSuperTokenPure =
    !isSuperTokenNative && underlyingTokenAddress === ZERO_ADDRESS;
  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network?.id,
    token:
      isSuperTokenNative || !underlyingTokenAddress
        ? void 0
        : (underlyingTokenAddress as Address),
    query: {
      refetchInterval: 10000,
      enabled: !isSuperTokenPure,
    },
  });
  const { data: superfluidQueryRes } = useQuery(SF_ACCOUNT_QUERY, {
    client: getApolloClient("superfluid", network.id),
    variables: {
      userAddress: address?.toLowerCase() ?? "",
      token: token.address.toLowerCase(),
    },
    skip: !council?.distributionPool,
    pollInterval: 10000,
  });
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });

  const poolMemberships = superfluidQueryRes?.account?.poolMemberships ?? null;
  const userAccountSnapshot =
    superfluidQueryRes?.account?.accountTokenSnapshots?.find(
      (snapshot: { token: { id: string } }) =>
        snapshot.token.id === distributionTokenAddress.toLowerCase(),
    ) ?? null;
  const superTokenBalance = useFlowingAmount(
    BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? 0),
    userAccountSnapshot?.updatedAtTimestamp ?? 0,
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0),
  );
  const minEthBalance = 0.001;
  const socialShare = getSocialShare({
    councilName: councilMetadata.name,
    councilUiLink: `https://flowstate.network/flow-councils/${network?.id}/${council?.id}`,
  });

  const outflowToReceiver = useMemo(() => {
    if (address && splitterAddress && superfluidQueryRes?.account?.outflows) {
      const outflow = superfluidQueryRes.account.outflows.find(
        (outflow: { receiver: { id: string } }) =>
          outflow.receiver.id === splitterAddress.toLowerCase(),
      );

      if (outflow) {
        return outflow;
      }
    }

    return null;
  }, [address, splitterAddress, superfluidQueryRes]);

  const flowRateToReceiver = outflowToReceiver?.currentFlowRate ?? "0";

  const userBufferContribution = useBufferContribution(
    network,
    splitterAddress,
    distributionTokenAddress,
    newFlowRate,
    flowRateToReceiver,
    superAppFunderData?.totalInflowRate ?? "0",
  );
  const suggestedTokenBalance = newFlowRate
    ? BigInt(newFlowRate) * BigInt(SECONDS_IN_MONTH) * BigInt(3) +
      userBufferContribution
    : BigInt(0);
  const hasSufficientEthBalance =
    ethBalance && ethBalance.value > parseEther(minEthBalance.toString())
      ? true
      : false;
  const hasSuggestedTokenBalance = superTokenBalance > suggestedTokenBalance;
  const hasSufficientTokenBalance =
    (!isSuperTokenPure &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance > BigInt(0)) ||
    superTokenBalance > BigInt(0)
      ? true
      : false;

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
    (amountPerTimeInterval: string) => {
      if (address) {
        const newFlowRate =
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));
        const accountFlowRate =
          BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0) +
          membershipsInflowRate;

        if (
          BigInt(-accountFlowRate) -
            BigInt(flowRateToReceiver) +
            BigInt(newFlowRate) >
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
                  (BigInt(balanceUntilUpdatedAt ?? "0") +
                    parseEther(wrapAmount?.replace(/,/g, "") ?? "0")) /
                    (BigInt(-accountFlowRate) -
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
      userAccountSnapshot,
      balanceUntilUpdatedAt,
      updatedAtTimestamp,
      membershipsInflowRate,
      address,
      wrapAmount,
      flowRateToReceiver,
    ],
  );

  const liquidationEstimate = useMemo(
    () => calcLiquidationEstimate(amountPerTimeInterval),
    [calcLiquidationEstimate, amountPerTimeInterval],
  );

  const transactions = useMemo(() => {
    if (
      !address ||
      !isAddress(distributionTokenAddress) ||
      !sfFramework ||
      !superToken ||
      !newFlowRate ||
      !ethersProvider ||
      !ethersSigner ||
      !splitterAddress
    ) {
      return [];
    }

    const underlyingToken = superToken.underlyingToken;

    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const isWrapperSuperToken =
      underlyingToken && underlyingToken.address !== ZERO_ADDRESS;
    const approvalTransactionsCount =
      isWrapperSuperToken &&
      wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0)
        ? 1
        : 0;
    const transactions: (() => Promise<void>)[] = [];
    const operations: Operation[] = [];

    if (wrapAmount && Number(wrapAmount?.replace(/,/g, "")) > 0) {
      if (underlyingToken && approvalTransactionsCount > 0) {
        transactions.push(async () => {
          const tx = await underlyingToken
            .approve({
              receiver: distributionTokenAddress,
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
        transactions.push(async () => {
          const tx = await (superToken as NativeAssetSuperToken)
            .upgrade({
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);

          await tx.wait();
        });
      }
    }

    if (userBufferContribution > 0n) {
      operations.push(
        superToken.transferFrom({
          sender: address,
          receiver: splitterAddress,
          amount: userBufferContribution.toString(),
        }),
      );
    }

    if (BigInt(newFlowRate) === BigInt(0) && BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.deleteFlow({
          sender: address,
          receiver: splitterAddress,
        }),
      );
    } else if (BigInt(flowRateToReceiver) > 0) {
      operations.push(
        superToken.updateFlow({
          sender: address,
          receiver: splitterAddress,
          flowRate: newFlowRate,
        }),
      );
    } else {
      operations.push(
        superToken.createFlow({
          sender: address,
          receiver: splitterAddress,
          flowRate: newFlowRate,
        }),
      );
    }

    transactions.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

      await tx.wait();
    });

    return transactions;
  }, [
    address,
    sfFramework,
    superToken,
    wrapAmount,
    newFlowRate,
    flowRateToReceiver,
    ethersProvider,
    ethersSigner,
    splitterAddress,
    distributionTokenAddress,
    underlyingTokenAllowance,
    userBufferContribution,
  ]);

  useEffect(() => {
    (async () => {
      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToReceiver) * BigInt(SECONDS_IN_MONTH),
        4,
      );

      setAmountPerTimeInterval(formatNumberWithCommas(currentStreamValue));
    })();
  }, [address, flowRateToReceiver]);

  useEffect(() => {
    if (!areTransactionsLoading && amountPerTimeInterval) {
      const newFlowRate =
        parseEther(amountPerTimeInterval.replace(/,/g, "")) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

      if (newFlowRate < MAX_FLOW_RATE) {
        setNewFlowRate(newFlowRate.toString());
      }
    }
  }, [areTransactionsLoading, amountPerTimeInterval]);

  useEffect(() => {
    (async () => {
      if (address && ethersProvider && isAddress(distributionTokenAddress)) {
        const sfFramework = await Framework.create({
          chainId: network.id,
          resolverAddress: network.superfluidResolver,
          provider: ethersProvider,
        });
        const superToken = await sfFramework.loadSuperToken(
          distributionTokenAddress,
        );
        const underlyingToken = superToken.underlyingToken;
        const underlyingTokenAllowance = await underlyingToken?.allowance({
          owner: address,
          spender: superToken.address,
          providerOrSigner: ethersProvider,
        });

        setUnderlyingTokenAllowance(underlyingTokenAllowance ?? "0");
        setSfFramework(sfFramework);
        setSuperToken(superToken);
      }
    })();
  }, [address, ethersProvider, distributionTokenAddress, network]);

  const updateWrapAmount = (
    amountPerTimeInterval: string,
    liquidationEstimate: number | null,
  ) => {
    if (amountPerTimeInterval) {
      const weiAmount = parseUnits(
        amountPerTimeInterval.replace(/,/g, ""),
        underlyingTokenBalance?.decimals ?? 18,
      );

      if (
        !isSuperTokenPure &&
        Number(amountPerTimeInterval.replace(/,/g, "")) > 0 &&
        liquidationEstimate &&
        dayjs
          .unix(liquidationEstimate)
          .isBefore(dayjs().add(dayjs.duration({ months: 3 })))
      ) {
        if (
          underlyingTokenBalance?.value &&
          underlyingTokenBalance.value <= weiAmount * BigInt(3)
        ) {
          const amount = isSuperTokenNative
            ? underlyingTokenBalance.value -
              parseEther(minEthBalance.toString())
            : underlyingTokenBalance?.value;

          setWrapAmount(
            formatNumberWithCommas(
              formatUnits(
                amount > 0 ? BigInt(amount) : BigInt(0),
                underlyingTokenBalance?.decimals ?? 18,
              ),
            ),
          );
        } else {
          setWrapAmount(
            formatNumberWithCommas(
              formatUnits(
                parseEther(amountPerTimeInterval.replace(/,/g, "")) * BigInt(3),
                underlyingTokenBalance?.decimals ?? 18,
              ),
            ),
          );
        }
      } else {
        setWrapAmount("");
      }

      const newFlowRate =
        parseEther(amountPerTimeInterval.replace(/,/g, "")) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));

      if (newFlowRate < MAX_FLOW_RATE) {
        setNewFlowRate(newFlowRate.toString());
      }
    }
  };

  return (
    <Offcanvas
      show
      onHide={hide}
      placement={isMobile ? "bottom" : "end"}
      className="p-4"
      style={{ height: "100%" }}
    >
      <Offcanvas.Header closeButton className="mb-4">
        <Offcanvas.Title className="fs-6 fw-semi-bold">
          Fund Distribution Pool
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack direction="vertical" className="flex-grow-0">
          <DistributionPoolDetails
            distributionPool={distributionPool}
            token={token}
            councilMetadata={councilMetadata}
            superAppFunderData={superAppFunderData}
            outflowToSplitter={outflowToReceiver}
          />
          {distributionPool &&
          (Number(distributionPool.totalUnits) > 0 ||
            BigInt(flowRateToReceiver) > 0) ? (
            <Accordion activeKey={step} className="mt-8">
              <EditStream
                isFundingDistributionPool={true}
                isSelected={step === Step.SELECT_AMOUNT}
                setStep={(step) => setStep(step)}
                token={token}
                network={network}
                flowRateToReceiver={flowRateToReceiver}
                amountPerTimeInterval={amountPerTimeInterval}
                setAmountPerTimeInterval={(amount) => {
                  const newAmount =
                    parseEther(amount.replace(/,/g, "")) /
                      BigInt(
                        fromTimeUnitsToSeconds(
                          1,
                          unitOfTime[TimeInterval.MONTH],
                        ),
                      ) <
                    MAX_FLOW_RATE
                      ? amount
                      : amountPerTimeInterval;

                  setAmountPerTimeInterval(newAmount);
                  updateWrapAmount(
                    newAmount,
                    calcLiquidationEstimate(newAmount),
                  );
                }}
                newFlowRate={newFlowRate}
                wrapAmount={wrapAmount}
                superTokenBalance={superTokenBalance}
                isSuperTokenPure={isSuperTokenPure}
                hasSufficientBalance={
                  !!hasSufficientEthBalance && !!hasSuggestedTokenBalance
                }
                docsLink="https://docs.flowstate.network/flow-councils/grow-the-pie"
              />
              <TopUp
                isFundingDistributionPool={true}
                step={step}
                setStep={(step) => setStep(step)}
                newFlowRate={newFlowRate}
                wrapAmount={wrapAmount}
                isSuperTokenPure={isSuperTokenPure}
                superTokenBalance={superTokenBalance}
                minEthBalance={minEthBalance}
                suggestedTokenBalance={suggestedTokenBalance}
                hasSufficientEthBalance={hasSufficientEthBalance}
                hasSufficientTokenBalance={hasSufficientTokenBalance}
                hasSuggestedTokenBalance={hasSuggestedTokenBalance}
                ethBalance={ethBalance}
                underlyingTokenBalance={underlyingTokenBalance}
                network={network}
                superTokenInfo={token}
              />
              {!isSuperTokenPure && (
                <Wrap
                  isFundingDistributionPool={true}
                  step={step}
                  setStep={setStep}
                  newFlowRate={newFlowRate}
                  wrapAmount={wrapAmount}
                  setWrapAmount={setWrapAmount}
                  token={token}
                  superTokenBalance={superTokenBalance}
                  underlyingTokenBalance={underlyingTokenBalance}
                />
              )}
              <Review
                isFundingDistributionPool={true}
                step={step}
                setStep={(step) => setStep(step)}
                network={network}
                receiver={splitterAddress ?? council?.distributionPool ?? ""}
                transactions={transactions}
                completedTransactions={completedTransactions}
                areTransactionsLoading={areTransactionsLoading}
                transactionError={transactionError}
                executeTransactions={executeTransactions}
                liquidationEstimate={liquidationEstimate}
                netImpact={BigInt(0)}
                token={token}
                flowRateToReceiver={flowRateToReceiver}
                amountPerTimeInterval={amountPerTimeInterval}
                newFlowRate={newFlowRate}
                wrapAmount={wrapAmount}
                isSuperTokenPure={isSuperTokenPure}
                superTokenBalance={superTokenBalance}
                underlyingTokenBalance={underlyingTokenBalance}
              />
              <Success
                step={step}
                socialShare={socialShare}
                newFlowRate={newFlowRate}
              />
            </Accordion>
          ) : (
            <Stack
              direction="vertical"
              className="bg-lace-100 rounded-4 mt-8 p-4"
            >
              <Stack
                direction="horizontal"
                gap={2}
                className="align-items-center mt-1 ms-3 fs-lg fw-semi-bold"
              >
                <Image src="/ballot.svg" alt="" width={32} height={32} />
                Submit a ballot first
              </Stack>
              <p className="ms-3 mt-2">
                Flow Councils can't distribute funding without at least one vote
                submitted.
              </p>
              <p className="ms-3">
                If you want to start all recipients with equal streams, you can
                assign one vote to each then return here.
              </p>
              <p className="ms-3">
                Otherwise, wait until a sufficient sample of Council members
                have submitted their ballots before starting your funding
                stream.
              </p>
            </Stack>
          )}
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
