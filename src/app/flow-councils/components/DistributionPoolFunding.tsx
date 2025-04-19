import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, isAddress, parseAbi, parseEther, formatEther } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import dayjs from "dayjs";
import { useQuery, gql } from "@apollo/client";
import {
  NativeAssetSuperToken,
  WrapperSuperToken,
  Operation,
  Framework,
} from "@superfluid-finance/sdk-core";
import duration from "dayjs/plugin/duration";
import Offcanvas from "react-bootstrap/Offcanvas";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import { Step } from "../types/distributionPoolFunding";
import EditStream from "./distribution-pool-funding/EditStream";
import TopUp from "./distribution-pool-funding/TopUp";
import Wrap from "./distribution-pool-funding/Wrap";
import Review from "./distribution-pool-funding/Review";
import Success from "./distribution-pool-funding/Success";
import { Network } from "@/types/network";
import DistributionPoolDetails from "./DistributionPoolDetails";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import useCouncil from "../hooks/council";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { getApolloClient } from "@/lib/apollo";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import { SECONDS_IN_MONTH, ZERO_ADDRESS } from "@/lib/constants";

const DISTRIBUTION_POOL_FUNDING_QUERY = gql`
  query DistributionPoolFundingQuery($gdaPool: String!, $userAddress: String!) {
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

export default function DistributionPoolFunding(props: {
  network: Network;
  hide: () => void;
}) {
  const { network, hide } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [transactions, setTransactions] = useState<(() => Promise<void>)[]>([]);
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");

  const { address } = useAccount();
  const { council, councilMetadata, token } = useCouncil();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const distributionTokenAddress = token.address;
  const { data: underlyingTokenAddress } = useReadContract({
    address: distributionTokenAddress,
    abi: parseAbi(["function getUnderlyingToken() view returns (address)"]),

    functionName: "getUnderlyingToken",
  });
  const { data: ethBalance } = useBalance({
    address,
    chainId: network.id,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network?.id,
    token: (underlyingTokenAddress as Address) ?? void 0,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: superfluidQueryRes } = useQuery(
    DISTRIBUTION_POOL_FUNDING_QUERY,
    {
      client: getApolloClient("superfluid", network.id),
      variables: {
        gdaPool: council?.pool?.toLowerCase(),
        userAddress: address?.toLowerCase() ?? "",
      },
      skip: !council?.pool,
      pollInterval: 10000,
    },
  );
  const ethersProvider = useEthersProvider({ chainId: network.id });
  const ethersSigner = useEthersSigner({ chainId: network.id });

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
    (amountPerTimeInterval: string, timeInterval: TimeInterval) => {
      if (address) {
        const newFlowRate =
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]));
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
    () => calcLiquidationEstimate(amountPerTimeInterval, timeInterval),
    [calcLiquidationEstimate, amountPerTimeInterval, timeInterval],
  );

  useEffect(() => {
    (async () => {
      if (
        !address ||
        !isAddress(distributionTokenAddress) ||
        !newFlowRate ||
        !ethersProvider ||
        !ethersSigner
      ) {
        return;
      }

      const sfFramework = await Framework.create({
        chainId: network.id,
        resolverAddress: network.superfluidResolver,
        provider: ethersProvider,
      });
      const superToken = await sfFramework.loadSuperToken(
        distributionTokenAddress,
      );
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

      operations.push(
        superToken.distributeFlow({
          from: address,
          pool: council?.pool ?? "",
          requestedFlowRate: newFlowRate,
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
    network,
    wrapAmount,
    newFlowRate,
    ethersProvider,
    ethersSigner,
    council?.pool,
    distributionTokenAddress,
    underlyingTokenAllowance,
  ]);

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
  }, [address, flowRateToReceiver, timeInterval]);

  useEffect(() => {
    if (!areTransactionsLoading && amountPerTimeInterval) {
      setNewFlowRate(
        (
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]))
        ).toString(),
      );
    }
  }, [areTransactionsLoading, amountPerTimeInterval, timeInterval]);

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
      }
    })();
  }, [address, ethersProvider, distributionTokenAddress, network]);

  const updateWrapAmount = (
    amountPerTimeInterval: string,
    timeInterval: TimeInterval,
    liquidationEstimate: number | null,
  ) => {
    if (amountPerTimeInterval) {
      if (
        Number(amountPerTimeInterval.replace(/,/g, "")) > 0 &&
        liquidationEstimate &&
        dayjs
          .unix(liquidationEstimate)
          .isBefore(dayjs().add(dayjs.duration({ months: 3 })))
      ) {
        setWrapAmount(
          formatNumberWithCommas(
            parseFloat(
              formatEther(
                parseEther(amountPerTimeInterval.replace(/,/g, "")) * BigInt(3),
              ),
            ),
          ),
        );
      } else {
        setWrapAmount("");
      }

      setNewFlowRate(
        (
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]))
        ).toString(),
      );
    }
  };

  return (
    <Offcanvas show onHide={hide} placement="end">
      <Offcanvas.Header closeButton className="pb-0">
        <Offcanvas.Title className="fs-3">
          Fund Distribution Pool
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <Stack direction="vertical" className="flex-grow-0">
          <DistributionPoolDetails
            gdaPool={superfluidQueryRes?.pool}
            token={token}
          />
          <Accordion activeKey={step} className="mt-4">
            <EditStream
              isSelected={step === Step.SELECT_AMOUNT}
              setStep={(step) => setStep(step)}
              token={token}
              network={network}
              flowRateToReceiver={flowRateToReceiver}
              amountPerTimeInterval={amountPerTimeInterval}
              setAmountPerTimeInterval={(amount) => {
                setAmountPerTimeInterval(amount);
                updateWrapAmount(
                  amount,
                  timeInterval,
                  calcLiquidationEstimate(amount, timeInterval),
                );
              }}
              newFlowRate={newFlowRate}
              wrapAmount={wrapAmount}
              timeInterval={timeInterval}
              setTimeInterval={(timeInterval) => {
                setTimeInterval(timeInterval);
                updateWrapAmount(
                  amountPerTimeInterval,
                  timeInterval,
                  calcLiquidationEstimate(amountPerTimeInterval, timeInterval),
                );
              }}
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
            <Wrap
              step={step}
              setStep={setStep}
              wrapAmount={wrapAmount}
              setWrapAmount={setWrapAmount}
              token={token}
              superTokenBalance={superTokenBalance}
              underlyingTokenBalance={underlyingTokenBalance}
            />
            <Review
              step={step}
              setStep={(step) => setStep(step)}
              network={network}
              receiver={council?.pool ?? ""}
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
              newFlowRateToFlowState={"0"}
              flowRateToFlowState={"0"}
              timeInterval={timeInterval}
              supportFlowStateAmount={"0"}
              supportFlowStateTimeInterval={TimeInterval.MONTH}
              isPureSuperToken={false}
              superTokenBalance={superTokenBalance}
              underlyingTokenBalance={underlyingTokenBalance}
            />
            <Success
              step={step}
              councilName={councilMetadata.name}
              councilUiLink={`https://flowstate.network/flow-councils/${network?.id}/${council?.id}`}
              newFlowRate={newFlowRate}
            />
          </Accordion>
        </Stack>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
