import { useState, useMemo, useEffect } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import dayjs from "dayjs";
import {
  NativeAssetSuperToken,
  WrapperSuperToken,
  Operation,
} from "@superfluid-finance/sdk-core";
import duration from "dayjs/plugin/duration";
import Offcanvas from "react-bootstrap/Offcanvas";
import Accordion from "react-bootstrap/Accordion";
import { MatchingPool } from "@/types/matchingPool";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import MatchingPoolDetails from "@/components/MatchingPoolDetails";
import EditStream from "@/components/checkout/EditStream";
import TopUp from "@/components/checkout/TopUp";
import Wrap from "@/components/checkout/Wrap";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import { useSuperfluidContext } from "@/context/Superfluid";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import { ZERO_ADDRESS, SECONDS_IN_MONTH } from "@/lib/constants";

type MatchingPoolFundingProps = {
  show: boolean;
  handleClose: () => void;
  poolName: string;
  description: string;
  poolUiLink: string;
  matchingPool: MatchingPool;
  matchingTokenInfo: Token;
  network?: Network;
  receiver: string;
  userAccountSnapshots:
    | {
        totalNetFlowRate: string;
        balanceUntilUpdatedAt: string;
        updatedAtTimestamp: number;
        token: { id: string };
      }[]
    | null;
};

dayjs().format();
dayjs.extend(duration);

export default function MatchingPoolFunding(props: MatchingPoolFundingProps) {
  const {
    show,
    handleClose,
    matchingPool,
    poolName,
    description,
    poolUiLink,
    matchingTokenInfo,
    network,
    receiver,
    userAccountSnapshots,
  } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [matchingTokenSymbol, setMatchingTokenSymbol] = useState("");

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const { sfFramework, matchingSuperToken } = useSuperfluidContext();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: ethBalance } = useBalance({
    address,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: !(matchingSuperToken as NativeAssetSuperToken)?.nativeTokenSymbol
      ? matchingTokenInfo.address
      : void 0,
    query: {
      refetchInterval: 10000,
    },
  });
  const ethersProvider = useEthersProvider();
  const ethersSigner = useEthersSigner();
  const userAccountSnapshot =
    userAccountSnapshots?.find(
      (snapshot) =>
        snapshot.token.id === matchingTokenInfo.address.toLowerCase(),
    ) ?? null;
  const superTokenBalance = useFlowingAmount(
    BigInt(userAccountSnapshot?.balanceUntilUpdatedAt ?? 0),
    userAccountSnapshot?.updatedAtTimestamp ?? 0,
    BigInt(userAccountSnapshot?.totalNetFlowRate ?? 0),
  );

  const minEthBalance = 0.001;
  const suggestedTokenBalance = newFlowRate
    ? BigInt(newFlowRate) * BigInt(SECONDS_IN_MONTH) * BigInt(2)
    : BigInt(0);
  const hasSufficientEthBalance =
    ethBalance && ethBalance.value > parseEther(minEthBalance.toString())
      ? true
      : false;
  const hasSufficientTokenBalance =
    underlyingTokenBalance &&
    underlyingTokenBalance.value + superTokenBalance > BigInt(0)
      ? true
      : false;
  const hasSuggestedTokenBalance =
    underlyingTokenBalance &&
    (underlyingTokenBalance.value > suggestedTokenBalance ||
      superTokenBalance > suggestedTokenBalance)
      ? true
      : false;

  const flowRateToReceiver = useMemo(() => {
    if (address && matchingPool) {
      const distributor = matchingPool.poolDistributors.find(
        (distributor: { account: { id: string } }) =>
          distributor.account.id === address.toLowerCase(),
      );

      if (distributor) {
        return distributor.flowRate;
      }
    }

    return "0";
  }, [address, matchingPool]);

  const liquidationEstimate = useMemo(() => {
    if (address) {
      const newFlowRate =
        parseEther(amountPerTimeInterval.replace(/,/g, "")) /
        BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]));
      const accountFlowRate = userAccountSnapshot?.totalNetFlowRate ?? "0";

      if (
        BigInt(accountFlowRate) -
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
                  (BigInt(accountFlowRate) -
                    BigInt(flowRateToReceiver) +
                    BigInt(newFlowRate)),
              ),
            }),
          )
          .unix();
      }
    }

    return null;
  }, [
    userAccountSnapshot,
    address,
    wrapAmount,
    flowRateToReceiver,
    amountPerTimeInterval,
    timeInterval,
  ]);

  const transactions = useMemo(() => {
    if (
      !address ||
      !matchingSuperToken ||
      !newFlowRate ||
      !underlyingTokenAllowance ||
      !matchingTokenSymbol ||
      !sfFramework ||
      !ethersProvider ||
      !ethersSigner
    ) {
      return [];
    }

    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const underlyingToken = matchingSuperToken.underlyingToken;
    const isWrapperSuperToken =
      underlyingToken && underlyingToken.address !== ZERO_ADDRESS;
    const isPureSuperToken =
      matchingTokenSymbol !== "ETHx" &&
      underlyingToken?.address === ZERO_ADDRESS;
    const approvalTransactionsCount =
      isWrapperSuperToken &&
      wrapAmountWei > BigInt(underlyingTokenAllowance ?? 0)
        ? 1
        : 0;
    const transactions: (() => Promise<void>)[] = [];
    const operations: Operation[] = [];

    if (
      !isPureSuperToken &&
      wrapAmount &&
      Number(wrapAmount?.replace(/,/g, "")) > 0
    ) {
      if (underlyingToken && approvalTransactionsCount > 0) {
        transactions.push(async () => {
          const tx = await underlyingToken
            .approve({
              receiver: matchingSuperToken.address,
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);

          await tx.wait();
        });
      }

      if (isWrapperSuperToken) {
        operations.push(
          (matchingSuperToken as WrapperSuperToken).upgrade({
            amount: wrapAmountWei.toString(),
          }),
        );
      } else {
        transactions.push(async () => {
          const tx = await (matchingSuperToken as NativeAssetSuperToken)
            .upgrade({
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);

          await tx.wait();
        });
      }
    }

    operations.push(
      matchingSuperToken.distributeFlow({
        from: address,
        pool: receiver,
        requestedFlowRate: newFlowRate,
      }),
    );
    transactions.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

      await tx.wait();
    });

    return transactions;
  }, [
    address,
    matchingSuperToken,
    wrapAmount,
    receiver,
    newFlowRate,
    underlyingTokenAllowance,
    matchingTokenSymbol,
    sfFramework,
    ethersProvider,
    ethersSigner,
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
      if (address && ethersProvider && matchingSuperToken) {
        const underlyingToken = matchingSuperToken.underlyingToken;
        const underlyingTokenAllowance = await underlyingToken?.allowance({
          owner: address,
          spender: matchingSuperToken.address,
          providerOrSigner: ethersProvider,
        });
        const matchingTokenSymbol = await matchingSuperToken?.symbol({
          providerOrSigner: ethersProvider,
        });
        setUnderlyingTokenAllowance(underlyingTokenAllowance ?? "0");
        setMatchingTokenSymbol(matchingTokenSymbol ?? "");
      }
    })();
  }, [address, ethersProvider, matchingSuperToken]);

  const updateWrapAmount = (
    amountPerTimeInterval: string,
    timeInterval: TimeInterval,
  ) => {
    if (amountPerTimeInterval) {
      if (
        Number(amountPerTimeInterval.replace(/,/g, "")) > 0 &&
        liquidationEstimate &&
        dayjs
          .unix(liquidationEstimate)
          .isBefore(dayjs().add(dayjs.duration({ months: 2 })))
      ) {
        setWrapAmount(
          formatNumberWithCommas(
            parseFloat(
              formatEther(
                parseEther(amountPerTimeInterval.replace(/,/g, "")) * BigInt(2),
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
    <Offcanvas
      show={show}
      onHide={handleClose}
      placement={isMobile ? "bottom" : "end"}
      className={`${isMobile ? "w-100 h-100" : ""}`}
    >
      <Offcanvas.Header closeButton>
        <Offcanvas.Title className="fs-4">Fund Matching Pool</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        <MatchingPoolDetails
          matchingPool={matchingPool}
          poolName={poolName}
          description={description}
          matchingTokenInfo={matchingTokenInfo}
        />
        <Accordion activeKey={step} className="mt-4">
          <EditStream
            isSelected={step === Step.SELECT_AMOUNT}
            setStep={(step) => setStep(step)}
            token={matchingTokenInfo}
            network={network}
            flowRateToReceiver={flowRateToReceiver}
            amountPerTimeInterval={amountPerTimeInterval}
            setAmountPerTimeInterval={(amount) => {
              setAmountPerTimeInterval(amount);
              updateWrapAmount(amount, timeInterval);
            }}
            newFlowRate={newFlowRate}
            wrapAmount={wrapAmount}
            timeInterval={timeInterval}
            setTimeInterval={(timeInterval) => {
              setTimeInterval(timeInterval);
              updateWrapAmount(amountPerTimeInterval, timeInterval);
            }}
            isFundingMatchingPool={true}
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
            isFundingMatchingPool={true}
            superTokenBalance={superTokenBalance}
            minEthBalance={minEthBalance}
            suggestedTokenBalance={suggestedTokenBalance}
            hasSufficientEthBalance={hasSufficientEthBalance}
            hasSufficientTokenBalance={hasSufficientTokenBalance}
            hasSuggestedTokenBalance={hasSuggestedTokenBalance}
            ethBalance={ethBalance}
            underlyingTokenBalance={underlyingTokenBalance}
            network={network}
            allocationTokenInfo={matchingTokenInfo}
          />
          <Wrap
            step={step}
            setStep={setStep}
            wrapAmount={wrapAmount}
            setWrapAmount={setWrapAmount}
            token={matchingTokenInfo}
            isFundingMatchingPool={true}
            superTokenBalance={superTokenBalance}
            underlyingTokenBalance={underlyingTokenBalance}
          />
          <Review
            step={step}
            setStep={(step) => setStep(step)}
            receiver={receiver}
            transactions={transactions}
            completedTransactions={completedTransactions}
            areTransactionsLoading={areTransactionsLoading}
            transactionError={transactionError}
            executeTransactions={executeTransactions}
            liquidationEstimate={liquidationEstimate}
            netImpact={BigInt(0)}
            matchingTokenInfo={matchingTokenInfo}
            allocationTokenInfo={matchingTokenInfo}
            flowRateToReceiver={flowRateToReceiver}
            amountPerTimeInterval={amountPerTimeInterval}
            newFlowRate={newFlowRate}
            wrapAmount={wrapAmount}
            timeInterval={timeInterval}
            isFundingMatchingPool={true}
            superTokenBalance={superTokenBalance}
            underlyingTokenBalance={underlyingTokenBalance}
          />
          <Success
            step={step}
            isFundingMatchingPool={true}
            poolName={poolName}
            poolUiLink={poolUiLink}
            newFlowRate={newFlowRate}
          />
        </Accordion>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
