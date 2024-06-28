import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, parseEther, formatEther } from "viem";
import { useAccount, useReadContract, useBalance } from "wagmi";
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
import { Inflow } from "@/types/inflow";
import { Outflow } from "@/types/outflow";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import GranteeDetails from "@/components/GranteeDetails";
import EditStream from "@/components/checkout/EditStream";
import TopUp from "@/components/checkout/TopUp";
import Wrap from "@/components/checkout/Wrap";
import Passport from "@/components/checkout/Passport";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import PassportMintingInstructions from "@/components/PassportMintingInstructions";
import { passportDecoderAbi } from "@/lib/abi/passportDecoder";
import { useSuperfluidContext } from "@/context/Superfluid";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import { ZERO_ADDRESS, SECONDS_IN_MONTH } from "@/lib/constants";

type GranteeFundingProps = {
  show: boolean;
  handleClose: () => void;
  name: string;
  twitter: string;
  description: string;
  receiver: string;
  recipientAddress: string;
  inflow: Inflow;
  matchingPool: MatchingPool;
  matchingFlowRate: bigint;
  userOutflow: Outflow | null;
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  userAccountSnapshots:
    | {
        totalNetFlowRate: string;
        balanceUntilUpdatedAt: string;
        updatedAtTimestamp: number;
        token: { id: string };
      }[]
    | null;
  network?: Network;
  passportDecoder?: Address;
  minPassportScore?: bigint;
};

dayjs().format();
dayjs.extend(duration);

export default function GranteeFunding(props: GranteeFundingProps) {
  const {
    show,
    handleClose,
    name,
    description,
    twitter,
    receiver,
    recipientAddress,
    inflow,
    matchingPool,
    matchingFlowRate,
    userOutflow,
    allocationTokenInfo,
    matchingTokenInfo,
    userAccountSnapshots,
    network,
    passportDecoder,
    minPassportScore,
  } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [allocationTokenSymbol, setAllocationTokenSymbol] = useState("");
  const [showMintingInstructions, setShowMintingInstructions] = useState(false);

  const { isMobile } = useMediaQuery();
  const { address } = useAccount();
  const { sfFramework, allocationSuperToken } = useSuperfluidContext();
  const {
    areTransactionsLoading,
    completedTransactions,
    transactionError,
    executeTransactions,
  } = useTransactionsQueue();
  const { data: passportScore, refetch: refetchPassportScore } =
    useReadContract({
      abi: passportDecoderAbi,
      address: passportDecoder ?? "0x",
      functionName: "getScore",
      args: [address as Address],
      query: {
        enabled: address && passportDecoder !== ZERO_ADDRESS ? true : false,
      },
    });
  const { data: ethBalance } = useBalance({
    address,
    query: {
      refetchInterval: 10000,
    },
  });
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: !(allocationSuperToken as NativeAssetSuperToken)?.nativeTokenSymbol
      ? allocationTokenInfo.address
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
        snapshot.token.id === allocationTokenInfo.address.toLowerCase(),
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
  const flowRateToReceiver = userOutflow?.currentFlowRate ?? "0";

  const editFlow = useCallback(
    (
      superToken: NativeAssetSuperToken | WrapperSuperToken,
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

  const netImpact = useMemo(() => {
    const member = matchingPool.poolMembers.find(
      (member) => member.account.id === recipientAddress,
    );

    if (member) {
      return calcMatchingImpactEstimate({
        totalFlowRate: BigInt(matchingPool.flowRate),
        totalUnits: BigInt(matchingPool.totalUnits),
        granteeUnits: BigInt(member.units),
        granteeFlowRate: BigInt(matchingFlowRate),
        previousFlowRate: BigInt(flowRateToReceiver ?? 0),
        newFlowRate: BigInt(newFlowRate ?? 0),
      });
    }

    return BigInt(0);
  }, [
    newFlowRate,
    flowRateToReceiver,
    matchingPool,
    matchingFlowRate,
    recipientAddress,
  ]);

  const transactions = useMemo(() => {
    if (
      !address ||
      !allocationSuperToken ||
      !newFlowRate ||
      !underlyingTokenAllowance ||
      !allocationTokenSymbol ||
      !sfFramework ||
      !ethersProvider ||
      !ethersSigner
    ) {
      return [];
    }

    const wrapAmountWei = parseEther(wrapAmount?.replace(/,/g, "") ?? "0");
    const underlyingToken = allocationSuperToken.underlyingToken;
    const isWrapperSuperToken =
      underlyingToken && underlyingToken.address !== ZERO_ADDRESS;
    const isPureSuperToken =
      allocationTokenSymbol !== "ETHx" &&
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
              receiver: allocationSuperToken.address,
              amount: wrapAmountWei.toString(),
            })
            .exec(ethersSigner);

          await tx.wait();
        });
      }

      if (isWrapperSuperToken) {
        operations.push(
          (allocationSuperToken as WrapperSuperToken).upgrade({
            amount: wrapAmountWei.toString(),
          }),
        );
      } else {
        transactions.push(async () => {
          const tx = await (allocationSuperToken as NativeAssetSuperToken)
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
        allocationSuperToken as WrapperSuperToken,
        receiver,
        flowRateToReceiver,
        newFlowRate,
      ),
    );
    transactions.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

      await tx.wait();
    });

    return transactions;
  }, [
    address,
    flowRateToReceiver,
    allocationSuperToken,
    wrapAmount,
    receiver,
    newFlowRate,
    underlyingTokenAllowance,
    allocationTokenSymbol,
    sfFramework,
    ethersProvider,
    ethersSigner,
    editFlow,
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
      if (address && ethersProvider && allocationSuperToken) {
        const underlyingToken = allocationSuperToken.underlyingToken;
        const underlyingTokenAllowance = await underlyingToken?.allowance({
          owner: address,
          spender: allocationSuperToken.address,
          providerOrSigner: ethersProvider,
        });
        const allocationTokenSymbol = await allocationSuperToken?.symbol({
          providerOrSigner: ethersProvider,
        });
        setUnderlyingTokenAllowance(underlyingTokenAllowance ?? "0");
        setAllocationTokenSymbol(allocationTokenSymbol ?? "");
      }
    })();
  }, [address, ethersProvider, allocationSuperToken]);

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
    <>
      <Offcanvas
        show={show}
        onHide={handleClose}
        placement={isMobile ? "bottom" : "end"}
        className={`${isMobile ? "w-100 h-100" : ""}`}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="fs-4">Fund Grantee</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <GranteeDetails
            name={name}
            description={description}
            recipientAddress={recipientAddress}
            inflow={inflow}
            matchingPool={matchingPool}
            matchingFlowRate={matchingFlowRate}
            userOutflow={userOutflow}
            allocationTokenInfo={allocationTokenInfo}
          />
          <Accordion activeKey={step} className="mt-4">
            <EditStream
              isSelected={step === Step.SELECT_AMOUNT}
              setStep={(step) => setStep(step)}
              token={allocationTokenInfo}
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
              isFundingMatchingPool={false}
              passportScore={passportScore ? Number(passportScore) / 10000 : 0}
              minPassportScore={
                minPassportScore ? Number(minPassportScore) / 10000 : 0
              }
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
              isFundingMatchingPool={false}
              passportScore={passportScore ? Number(passportScore) / 10000 : 0}
              minPassportScore={
                minPassportScore ? Number(minPassportScore) / 10000 : 0
              }
              superTokenBalance={superTokenBalance}
              minEthBalance={minEthBalance}
              suggestedTokenBalance={suggestedTokenBalance}
              hasSufficientEthBalance={hasSufficientEthBalance}
              hasSufficientTokenBalance={hasSufficientTokenBalance}
              hasSuggestedTokenBalance={hasSuggestedTokenBalance}
              ethBalance={ethBalance}
              underlyingTokenBalance={underlyingTokenBalance}
            />
            <Passport
              step={step}
              setStep={setStep}
              passportScore={passportScore ? Number(passportScore) / 10000 : 0}
              minPassportScore={
                minPassportScore ? Number(minPassportScore) / 10000 : 0
              }
              setShowMintingInstructions={setShowMintingInstructions}
              refetchPassportScore={refetchPassportScore}
            />
            <Wrap
              step={step}
              setStep={setStep}
              wrapAmount={wrapAmount}
              setWrapAmount={setWrapAmount}
              token={allocationTokenInfo}
              isFundingMatchingPool={false}
              passportScore={passportScore ? Number(passportScore) / 10000 : 0}
              minPassportScore={
                minPassportScore ? Number(minPassportScore) / 10000 : 0
              }
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
              netImpact={netImpact}
              matchingTokenInfo={matchingTokenInfo}
              allocationTokenInfo={allocationTokenInfo}
              flowRateToReceiver={flowRateToReceiver}
              amountPerTimeInterval={amountPerTimeInterval}
              newFlowRate={newFlowRate}
              wrapAmount={wrapAmount}
              timeInterval={timeInterval}
              isFundingMatchingPool={false}
              superTokenBalance={superTokenBalance}
              underlyingTokenBalance={underlyingTokenBalance}
            />
            <Success
              step={step}
              isFundingMatchingPool={false}
              granteeName={name}
              granteeTwitter={twitter}
              newFlowRate={newFlowRate}
            />
          </Accordion>
        </Offcanvas.Body>
      </Offcanvas>
      {network && showMintingInstructions && (
        <PassportMintingInstructions
          show={showMintingInstructions}
          hide={() => setShowMintingInstructions(false)}
          network={network}
        />
      )}
    </>
  );
}
