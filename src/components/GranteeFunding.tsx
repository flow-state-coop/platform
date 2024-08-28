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
import NFTGating from "@/components/checkout/NFTGating";
import SupportFlowState from "@/components/checkout/SupportFlowState";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import PassportMintingInstructions from "@/components/PassportMintingInstructions";
import { useSuperfluidContext } from "@/context/Superfluid";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
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
} from "@/lib/constants";

type GranteeFundingProps = {
  show: boolean;
  handleClose: () => void;
  name: string;
  twitter: string;
  description: string;
  logoCid: string;
  placeholderLogo: string;
  poolUiLink: string;
  framesLink: string;
  poolName: string;
  receiver: string;
  recipientAddress: string;
  inflow: Inflow;
  matchingPool: MatchingPool;
  matchingFlowRate: bigint;
  userOutflow: Outflow | null;
  flowRateToFlowState: string;
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
  isEligible: boolean;
  passportScore?: bigint;
  refetchPassportScore: (args: { throwOnError: boolean }) => void;
  passportDecoder?: Address;
  minPassportScore?: bigint;
  requiredNftAddress: Address | null;
  nftMintUrl: string | null;
};

dayjs().format();
dayjs.extend(duration);

export default function GranteeFunding(props: GranteeFundingProps) {
  const {
    show,
    handleClose,
    name,
    description,
    logoCid,
    placeholderLogo,
    twitter,
    poolUiLink,
    framesLink,
    poolName,
    receiver,
    recipientAddress,
    inflow,
    matchingPool,
    matchingFlowRate,
    userOutflow,
    flowRateToFlowState,
    allocationTokenInfo,
    matchingTokenInfo,
    userAccountSnapshots,
    network,
    isEligible,
    passportScore,
    refetchPassportScore,
    minPassportScore,
    requiredNftAddress,
    nftMintUrl,
  } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(
    TimeInterval.MONTH,
  );
  const [newFlowRate, setNewFlowRate] = useState("");
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [wrapAmount, setWrapAmount] = useState("");
  const [newFlowRateToFlowState, setNewFlowRateToFlowState] = useState("");
  const [supportFlowStateAmount, setSupportFlowStateAmount] = useState("");
  const [supportFlowStateTimeInterval, setSupportFlowStateTimeInterval] =
    useState<TimeInterval>(TimeInterval.MONTH);
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
  const { data: ethBalance } = useBalance({
    address,
    query: {
      refetchInterval: 10000,
    },
  });
  const isPureSuperToken =
    allocationTokenSymbol !== "ETHx" && !allocationSuperToken?.underlyingToken;
  const { data: underlyingTokenBalance } = useBalance({
    address,
    token:
      (allocationSuperToken?.underlyingToken?.address as Address) ?? void 0,
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
    (!isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance > BigInt(0)) ||
    (isPureSuperToken && superTokenBalance > BigInt(0))
      ? true
      : false;
  const hasSuggestedTokenBalance =
    (!isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value > suggestedTokenBalance) ||
    superTokenBalance > suggestedTokenBalance
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
      const newFlowRateToFlowState =
        parseEther(supportFlowStateAmount.replace(/,/g, "")) /
        BigInt(
          fromTimeUnitsToSeconds(1, unitOfTime[supportFlowStateTimeInterval]),
        );
      const accountFlowRate = userAccountSnapshot?.totalNetFlowRate ?? "0";

      if (
        BigInt(accountFlowRate) -
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
                  (BigInt(accountFlowRate) -
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
  }, [
    userAccountSnapshot,
    address,
    wrapAmount,
    flowRateToReceiver,
    amountPerTimeInterval,
    timeInterval,
    flowRateToFlowState,
    supportFlowStateAmount,
    supportFlowStateTimeInterval,
  ]);

  const netImpact = useMemo(() => {
    const member = matchingPool?.poolMembers.find(
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

    if (
      newFlowRateToFlowState &&
      newFlowRateToFlowState !== flowRateToReceiver
    ) {
      operations.push(
        editFlow(
          allocationSuperToken as WrapperSuperToken,
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
    flowRateToReceiver,
    flowRateToFlowState,
    allocationSuperToken,
    wrapAmount,
    receiver,
    newFlowRate,
    newFlowRateToFlowState,
    underlyingTokenAllowance,
    allocationTokenSymbol,
    sfFramework,
    isPureSuperToken,
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
    (async () => {
      if (step !== Step.SUPPORT) {
        return;
      }

      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToFlowState) * BigInt(SECONDS_IN_MONTH),
        4,
      );

      const suggestedSupportDonation =
        suggestedSupportDonationByToken[allocationTokenInfo.name] ?? 1;

      setSupportFlowStateAmount(
        formatNumberWithCommas(
          parseFloat(currentStreamValue) + suggestedSupportDonation,
        ),
      );
    })();
  }, [
    address,
    flowRateToFlowState,
    supportFlowStateTimeInterval,
    step,
    allocationTokenInfo.name,
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
            logoCid={logoCid}
            placeholderLogo={placeholderLogo}
            poolUiLink={poolUiLink}
            recipientAddress={recipientAddress}
            inflow={inflow}
            matchingPool={matchingPool}
            matchingFlowRate={matchingFlowRate}
            userOutflow={userOutflow}
            allocationTokenInfo={allocationTokenInfo}
            matchingTokenInfo={matchingTokenInfo}
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
              isEligible={isEligible}
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
              isEligible={isEligible}
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
              superTokenInfo={allocationTokenInfo}
            />
            {!isPureSuperToken && (
              <Wrap
                step={step}
                setStep={setStep}
                wrapAmount={wrapAmount}
                setWrapAmount={setWrapAmount}
                token={allocationTokenInfo}
                isFundingMatchingPool={false}
                isEligible={isEligible}
                superTokenBalance={superTokenBalance}
                underlyingTokenBalance={underlyingTokenBalance}
              />
            )}
            {requiredNftAddress ? (
              <NFTGating
                step={step}
                setStep={setStep}
                network={network}
                requiredNftAddress={requiredNftAddress}
                nftMintUrl={nftMintUrl}
                isEligible={isEligible}
                isPureSuperToken={isPureSuperToken}
              />
            ) : (
              <Passport
                step={step}
                setStep={setStep}
                passportScore={
                  passportScore ? Number(passportScore) / 10000 : 0
                }
                minPassportScore={
                  minPassportScore ? Number(minPassportScore) / 10000 : 0
                }
                setShowMintingInstructions={setShowMintingInstructions}
                refetchPassportScore={refetchPassportScore}
                isPureSuperToken={isPureSuperToken}
              />
            )}
            <SupportFlowState
              network={network}
              token={allocationTokenInfo}
              step={step}
              setStep={(step) => setStep(step)}
              supportFlowStateAmount={supportFlowStateAmount}
              setSupportFlowStateAmount={setSupportFlowStateAmount}
              supportFlowStateTimeInterval={supportFlowStateTimeInterval}
              setSupportFlowStateTimeInterval={setSupportFlowStateTimeInterval}
              newFlowRateToFlowState={newFlowRateToFlowState}
              flowRateToFlowState={flowRateToFlowState}
              isFundingMatchingPool={false}
              isPureSuperToken={isPureSuperToken}
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
              newFlowRateToFlowState={newFlowRateToFlowState}
              flowRateToFlowState={flowRateToFlowState}
              timeInterval={timeInterval}
              supportFlowStateAmount={supportFlowStateAmount}
              supportFlowStateTimeInterval={supportFlowStateTimeInterval}
              isFundingMatchingPool={false}
              isPureSuperToken={isPureSuperToken}
              superTokenBalance={superTokenBalance}
              underlyingTokenBalance={underlyingTokenBalance}
            />
            <Success
              step={step}
              isFundingMatchingPool={false}
              granteeName={name}
              granteeTwitter={twitter ? `@${twitter}` : ""}
              poolName={poolName}
              poolUiLink={poolUiLink}
              framesLink={framesLink}
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
          minPassportScore={
            minPassportScore ? Number(minPassportScore) / 10000 : 0
          }
        />
      )}
    </>
  );
}
