import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, parseEther, formatEther } from "viem";
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
import { GDAPool } from "@/types/gdaPool";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import MatchingPoolDetails from "@/components/MatchingPoolDetails";
import EditStream from "@/components/checkout/EditStream";
import TopUp from "@/components/checkout/TopUp";
import Wrap from "@/components/checkout/Wrap";
//import SupportFlowState from "@/components/checkout/SupportFlowState";
import Review from "@/components/checkout/Review";
import MatchingPoolNft from "@/components/checkout/MatchingPoolNft";
import Success from "@/components/checkout/Success";
import { useSuperfluidContext } from "@/context/Superfluid";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { suggestedSupportDonationByToken } from "@/lib/suggestedSupportDonationByToken";
import {
  TimeInterval,
  unitOfTime,
  fromTimeUnitsToSeconds,
  formatNumberWithCommas,
  roundWeiAmount,
} from "@/lib/utils";
import {
  ZERO_ADDRESS,
  SECONDS_IN_MONTH,
  FLOW_STATE_RECEIVER,
  DEFAULT_CHAIN_ID,
} from "@/lib/constants";

type MatchingPoolFundingProps = {
  show: boolean;
  handleClose: () => void;
  poolName: string;
  description: string;
  poolUiLink: string;
  matchingPool: GDAPool;
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
  shouldMintNft: boolean;
};

enum MintingError {
  FAIL = "Something went wrong. Please try again.",
}

dayjs().format();
dayjs.extend(duration);

const MIN_FLOW_RATE_NFT_MINT = BigInt(380517503);
const OCTANT_GDA_POOL = "0x8398c030be586c86759c4f1fc9f63df83c99813a";

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
    shouldMintNft,
  } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [newFlowRate, setNewFlowRate] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [newFlowRateToFlowState, setNewFlowRateToFlowState] = useState("");
  const [flowRateToFlowState, setFlowRateToFlowState] = useState("");
  const [supportFlowStateAmount, setSupportFlowStateAmount] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [supportFlowStateTimeInterval, setSupportFlowStateTimeInterval] =
    useState<TimeInterval>(TimeInterval.MONTH);
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [matchingTokenSymbol, setMatchingTokenSymbol] = useState("");
  const [isMintingNft, setIsMintingNft] = useState(false);
  const [hasMintedNft, setHasMintedNft] = useState(false);
  const [mintingError, setMintingError] = useState("");

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
    chainId: network?.id ?? DEFAULT_CHAIN_ID,
    query: {
      refetchInterval: 10000,
    },
  });
  const isPureSuperToken =
    matchingTokenSymbol !== "ETHx" && !matchingSuperToken?.underlyingToken;
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token: (matchingSuperToken?.underlyingToken?.address as Address) ?? void 0,
    chainId: network?.id ?? DEFAULT_CHAIN_ID,
    query: {
      refetchInterval: 10000,
      enabled: !isPureSuperToken,
    },
  });
  const ethersProvider = useEthersProvider({ chainId: network?.id });
  const ethersSigner = useEthersSigner({ chainId: network?.id });
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
    ? BigInt(newFlowRate) * BigInt(SECONDS_IN_MONTH) * BigInt(3)
    : BigInt(0);
  const hasSufficientEthBalance =
    ethBalance && ethBalance.value > parseEther(minEthBalance.toString())
      ? true
      : false;
  const hasSufficientTokenBalance =
    (!isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance > BigInt(0)) ||
    superTokenBalance > BigInt(0)
      ? true
      : false;
  const hasSuggestedTokenBalance =
    (isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value > suggestedTokenBalance) ||
    superTokenBalance > suggestedTokenBalance
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

  const calcLiquidationEstimate = useCallback(
    (amountPerTimeInterval: string, timeInterval: TimeInterval) => {
      if (address) {
        const newFlowRate =
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[timeInterval]));
        const newFlowRateToFlowState =
          parseEther(supportFlowStateAmount.replace(/,/g, "")) /
          BigInt(
            fromTimeUnitsToSeconds(1, unitOfTime[supportFlowStateTimeInterval]),
          );
        const accountFlowRate = userAccountSnapshot?.totalNetFlowRate ?? "0";

        if (
          BigInt(-accountFlowRate) -
            BigInt(flowRateToReceiver) -
            BigInt(flowRateToFlowState) +
            BigInt(newFlowRate) +
            BigInt(newFlowRateToFlowState) >
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
                      BigInt(flowRateToReceiver) -
                      BigInt(flowRateToFlowState) +
                      BigInt(newFlowRate) +
                      BigInt(newFlowRateToFlowState)),
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
      address,
      wrapAmount,
      flowRateToReceiver,
      flowRateToFlowState,
      supportFlowStateAmount,
      supportFlowStateTimeInterval,
    ],
  );

  const handleNftMint = useCallback(async () => {
    try {
      setIsMintingNft(true);
      setMintingError("");

      const res = await fetch("/api/matching-pool-nft", {
        method: "POST",
        body: JSON.stringify({
          address,
          chainId: network?.id ?? DEFAULT_CHAIN_ID,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      if (data.success) {
        setHasMintedNft(true);
      } else {
        setMintingError(MintingError.FAIL);
      }

      setIsMintingNft(false);

      console.info(data);
    } catch (err) {
      setIsMintingNft(false);
      setMintingError(MintingError.FAIL);

      console.error(err);
    }
  }, [network, address]);

  const liquidationEstimate = useMemo(
    () => calcLiquidationEstimate(amountPerTimeInterval, timeInterval),
    [calcLiquidationEstimate, amountPerTimeInterval, timeInterval],
  );

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

    if (
      newFlowRateToFlowState &&
      newFlowRateToFlowState !== flowRateToFlowState
    ) {
      operations.push(
        editFlow(
          matchingSuperToken as WrapperSuperToken,
          FLOW_STATE_RECEIVER,
          flowRateToFlowState,
          newFlowRateToFlowState,
        ),
      );
    }

    transactions.push(async () => {
      const tx = await sfFramework.batchCall(operations).exec(ethersSigner);

      await tx.wait();

      if (
        newFlowRateToFlowState &&
        newFlowRateToFlowState !== flowRateToFlowState
      ) {
        sessionStorage.setItem("skipSupportFlowState", "true");
      }
    });

    return transactions;
  }, [
    address,
    matchingSuperToken,
    wrapAmount,
    receiver,
    flowRateToFlowState,
    newFlowRate,
    newFlowRateToFlowState,
    underlyingTokenAllowance,
    matchingTokenSymbol,
    sfFramework,
    ethersProvider,
    ethersSigner,
    isPureSuperToken,
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
    (async () => {
      if (step === Step.SUCCESS) {
        if (shouldMintNft && BigInt(newFlowRate) >= MIN_FLOW_RATE_NFT_MINT) {
          handleNftMint();
        }
      } else if (step === Step.SUPPORT) {
        const currentStreamValue = roundWeiAmount(
          BigInt(flowRateToFlowState) * BigInt(SECONDS_IN_MONTH),
          4,
        );

        const suggestedSupportDonation =
          suggestedSupportDonationByToken[matchingTokenInfo.name] ?? 1;

        setSupportFlowStateAmount(
          formatNumberWithCommas(
            parseFloat(currentStreamValue) + suggestedSupportDonation,
          ),
        );
      }
    })();
  }, [
    address,
    flowRateToFlowState,
    supportFlowStateTimeInterval,
    matchingTokenInfo.name,
    step,
    newFlowRate,
    handleNftMint,
    shouldMintNft,
  ]);

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
    if (areTransactionsLoading) {
      return;
    }

    setNewFlowRateToFlowState(
      supportFlowStateAmount
        ? (
            parseEther(supportFlowStateAmount.replace(/,/g, "")) /
            BigInt(
              fromTimeUnitsToSeconds(
                1,
                unitOfTime[supportFlowStateTimeInterval],
              ),
            )
          ).toString()
        : "",
    );
  }, [
    areTransactionsLoading,
    supportFlowStateAmount,
    supportFlowStateTimeInterval,
  ]);

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

  useEffect(() => {
    (async () => {
      if (
        areTransactionsLoading ||
        !matchingSuperToken ||
        !address ||
        !ethersProvider
      ) {
        return;
      }

      const flowInfo = await matchingSuperToken.getFlow({
        sender: address,
        receiver: FLOW_STATE_RECEIVER,
        providerOrSigner: ethersProvider,
      });

      setFlowRateToFlowState(flowInfo.flowRate);
    })();
  }, [areTransactionsLoading, matchingSuperToken, address, ethersProvider]);

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
            underlyingTokenBalance={
              !isPureSuperToken ? underlyingTokenBalance : void 0
            }
            network={network}
            superTokenInfo={matchingTokenInfo}
          />
          {!isPureSuperToken && (
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
          )}
          {/*
          <SupportFlowState
            network={network}
            token={matchingTokenInfo}
            step={step}
            setStep={(step) => setStep(step)}
            supportFlowStateAmount={supportFlowStateAmount}
            setSupportFlowStateAmount={setSupportFlowStateAmount}
            supportFlowStateTimeInterval={supportFlowStateTimeInterval}
            setSupportFlowStateTimeInterval={setSupportFlowStateTimeInterval}
            newFlowRateToFlowState={newFlowRateToFlowState}
            flowRateToFlowState={flowRateToFlowState}
            isFundingMatchingPool={true}
            isPureSuperToken={isPureSuperToken}
          />
          */}
          <Review
            step={step}
            setStep={(step) => setStep(step)}
            network={network}
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
            newFlowRateToFlowState={newFlowRateToFlowState}
            flowRateToFlowState={flowRateToFlowState}
            newFlowRate={newFlowRate}
            wrapAmount={wrapAmount}
            timeInterval={timeInterval}
            supportFlowStateAmount={supportFlowStateAmount}
            supportFlowStateTimeInterval={supportFlowStateTimeInterval}
            isFundingMatchingPool={true}
            isPureSuperToken={isPureSuperToken}
            superTokenBalance={superTokenBalance}
            underlyingTokenBalance={underlyingTokenBalance}
          />
          {receiver?.toLowerCase() === OCTANT_GDA_POOL &&
          ((shouldMintNft &&
            BigInt(flowRateToReceiver) >= MIN_FLOW_RATE_NFT_MINT) ||
            ((shouldMintNft || isMintingNft || hasMintedNft) &&
              step === Step.SUCCESS &&
              BigInt(newFlowRate) >= MIN_FLOW_RATE_NFT_MINT)) ? (
            <MatchingPoolNft
              handleNftMint={handleNftMint}
              isMinting={isMintingNft}
              hasMinted={hasMintedNft}
              error={mintingError}
            />
          ) : null}
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
