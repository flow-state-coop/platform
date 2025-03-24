import { useState, useMemo, useEffect, useCallback } from "react";
import { Address, parseEther, parseUnits, formatUnits } from "viem";
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
import FlowStateEligibility from "@/components/checkout/FlowStateEligibility";
import MintNFT from "@/components/checkout/MintNFT";
import NFTGating from "@/components/checkout/NFTGating";
import SupportFlowState from "@/components/checkout/SupportFlowState";
import Review from "@/components/checkout/Review";
import Success from "@/components/checkout/Success";
import PassportMintingInstructions from "@/components/PassportMintingInstructions";
import { useSuperfluidContext } from "@/context/Superfluid";
import { ProjectMetadata } from "@/types/project";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useSuperTokenBalanceOfNow from "@/hooks/superTokenBalanceOfNow";
import useFlowingAmount from "@/hooks/flowingAmount";
import useTransactionsQueue from "@/hooks/transactionsQueue";
import { useEthersProvider, useEthersSigner } from "@/hooks/ethersAdapters";
import { getPoolFlowRateConfig } from "@/lib/poolFlowRateConfig";
import { calcMatchingImpactEstimate } from "@/lib/matchingImpactEstimate";
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

type GranteeFundingProps = {
  show: boolean;
  handleClose: () => void;
  metadata: ProjectMetadata;
  twitter: string;
  placeholderLogo: string;
  poolUiLink: string;
  framesLink: string;
  poolName: string;
  receiver: string;
  recipientAddress: string;
  inflow: Inflow;
  matchingPool: GDAPool;
  matchingFlowRate: bigint;
  userOutflow: Outflow | null;
  flowRateToFlowState: string;
  allocationTokenInfo: Token;
  matchingTokenInfo: Token;
  userAccountSnapshots:
    | {
        totalNetFlowRate: string;
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
  flowStateEligibility: boolean;
  nftMintUrl: string | null;
  recipientId: string;
};

dayjs().format();
dayjs.extend(duration);

export default function GranteeFunding(props: GranteeFundingProps) {
  const {
    show,
    handleClose,
    metadata,
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
    flowStateEligibility,
    nftMintUrl,
    recipientId,
  } = props;

  const [step, setStep] = useState<Step>(Step.SELECT_AMOUNT);
  const [amountPerTimeInterval, setAmountPerTimeInterval] = useState("");
  const [newFlowRate, setNewFlowRate] = useState("");
  const [underlyingTokenAllowance, setUnderlyingTokenAllowance] = useState("0");
  const [wrapAmount, setWrapAmount] = useState("");
  const [newFlowRateToFlowState, setNewFlowRateToFlowState] = useState("");
  const [supportFlowStateAmount, setSupportFlowStateAmount] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    chainId: network?.id ?? DEFAULT_CHAIN_ID,
    query: {
      refetchInterval: 10000,
    },
  });
  const isNativeSuperToken = allocationTokenSymbol === "ETHx";
  const isPureSuperToken =
    allocationTokenSymbol !== "ETHx" && !allocationSuperToken?.underlyingToken;
  const { data: underlyingTokenBalance } = useBalance({
    address,
    chainId: network?.id ?? DEFAULT_CHAIN_ID,
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
  const { balanceUntilUpdatedAt, updatedAtTimestamp } =
    useSuperTokenBalanceOfNow({
      token: allocationTokenInfo.address,
      address: address ?? "",
      chainId: network?.id ?? DEFAULT_CHAIN_ID,
    });
  const superTokenBalance = useFlowingAmount(
    BigInt(balanceUntilUpdatedAt ?? 0),
    updatedAtTimestamp ?? 0,
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
  const hasSufficientTokenBalance =
    (!isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance > BigInt(0)) ||
    superTokenBalance > BigInt(0)
      ? true
      : false;
  const hasSuggestedTokenBalance =
    (!isPureSuperToken &&
      underlyingTokenBalance &&
      underlyingTokenBalance.value + superTokenBalance >
        suggestedTokenBalance) ||
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

  const calcLiquidationEstimate = useCallback(
    (amountPerTimeInterval: string) => {
      if (address) {
        const newFlowRate =
          parseEther(amountPerTimeInterval.replace(/,/g, "")) /
          BigInt(fromTimeUnitsToSeconds(1, unitOfTime[TimeInterval.MONTH]));
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
          const date = dayjs(
            new Date(
              updatedAtTimestamp ? updatedAtTimestamp * 1000 : Date.now(),
            ),
          );

          return date
            .add(
              dayjs.duration({
                seconds: Number(
                  (BigInt(balanceUntilUpdatedAt ?? 0) +
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
      balanceUntilUpdatedAt,
      updatedAtTimestamp,
      address,
      wrapAmount,
      flowRateToReceiver,
      flowRateToFlowState,
      supportFlowStateAmount,
      supportFlowStateTimeInterval,
    ],
  );

  const poolFlowRateConfig = useMemo(
    () => getPoolFlowRateConfig(allocationTokenSymbol),
    [allocationTokenSymbol],
  );

  const liquidationEstimate = useMemo(
    () => calcLiquidationEstimate(amountPerTimeInterval),
    [calcLiquidationEstimate, amountPerTimeInterval],
  );

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
        flowRateScaling: poolFlowRateConfig.flowRateScaling,
      });
    }

    return BigInt(0);
  }, [
    newFlowRate,
    flowRateToReceiver,
    poolFlowRateConfig,
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
  }, [address, flowRateToReceiver]);

  useEffect(() => {
    (async () => {
      if (step !== Step.SUPPORT) {
        return;
      }

      const currentStreamValue = roundWeiAmount(
        BigInt(flowRateToFlowState) * BigInt(SECONDS_IN_MONTH),
        4,
      );

      setSupportFlowStateAmount(
        formatNumberWithCommas(
          parseFloat(currentStreamValue) +
            poolFlowRateConfig.suggestedFlowStateDonation,
        ),
      );
    })();
  }, [
    address,
    flowRateToFlowState,
    poolFlowRateConfig,
    supportFlowStateTimeInterval,
    step,
    allocationTokenInfo.name,
  ]);

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
    liquidationEstimate: number | null,
  ) => {
    if (amountPerTimeInterval) {
      const weiAmount = parseUnits(
        amountPerTimeInterval.replace(/,/g, ""),
        underlyingTokenBalance?.decimals ?? 18,
      );

      if (
        weiAmount > 0 &&
        liquidationEstimate &&
        dayjs
          .unix(liquidationEstimate)
          .isBefore(dayjs().add(dayjs.duration({ months: 3 })))
      ) {
        if (
          underlyingTokenBalance?.value &&
          underlyingTokenBalance.value <= weiAmount * BigInt(3)
        ) {
          const amount = isNativeSuperToken
            ? underlyingTokenBalance.value -
              parseEther(minEthBalance.toString())
            : underlyingTokenBalance?.value;

          setWrapAmount(
            formatNumberWithCommas(
              parseFloat(
                formatUnits(
                  amount > 0 ? BigInt(amount) : BigInt(0),
                  underlyingTokenBalance?.decimals ?? 18,
                ),
              ),
            ),
          );
        } else {
          setWrapAmount(
            formatNumberWithCommas(
              parseFloat(
                formatUnits(
                  weiAmount * BigInt(3),
                  underlyingTokenBalance?.decimals ?? 18,
                ),
              ),
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
            metadata={metadata}
            placeholderLogo={placeholderLogo}
            poolUiLink={poolUiLink}
            recipientAddress={recipientAddress}
            inflow={inflow}
            matchingPool={matchingPool}
            matchingFlowRate={matchingFlowRate}
            userOutflow={userOutflow}
            allocationTokenInfo={allocationTokenInfo}
            matchingTokenInfo={matchingTokenInfo}
            recipientId={recipientId}
            chainId={network?.id}
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
                updateWrapAmount(amount, calcLiquidationEstimate(amount));
              }}
              newFlowRate={newFlowRate}
              wrapAmount={wrapAmount}
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
                newFlowRate={newFlowRate}
                token={allocationTokenInfo}
                isFundingMatchingPool={false}
                isEligible={isEligible}
                superTokenBalance={superTokenBalance}
                underlyingTokenBalance={underlyingTokenBalance}
              />
            )}
            {requiredNftAddress && flowStateEligibility ? (
              <FlowStateEligibility
                step={step}
                setStep={setStep}
                network={network}
                requiredNftAddress={requiredNftAddress}
                isEligible={isEligible}
                isPureSuperToken={isPureSuperToken}
              />
            ) : requiredNftAddress &&
              nftMintUrl?.startsWith("https://guild.xyz/octant-sqf-voter") ? (
              <MintNFT
                step={step}
                setStep={setStep}
                network={network}
                requiredNftAddress={requiredNftAddress}
                isEligible={isEligible}
                isPureSuperToken={isPureSuperToken}
              />
            ) : requiredNftAddress ? (
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
              network={network}
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
              granteeName={metadata.title}
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
