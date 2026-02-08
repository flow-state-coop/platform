import { useState, useMemo } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { formatEther, parseEther } from "viem";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Image from "next/image";
import Card from "react-bootstrap/Card";
import Accordion from "react-bootstrap/Accordion";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Button from "react-bootstrap/Button";
import FormCheckInput from "react-bootstrap/FormCheckInput";
import Alert from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import CopyTooltip from "@/components/CopyTooltip";
import { Step } from "@/types/checkout";
import { Token } from "@/types/token";
import { Network } from "@/types/network";
import { formatNumber, fromTimeUnitsToSeconds, truncateStr } from "@/lib/utils";

dayjs().format();
dayjs.extend(duration);

export type ReviewProps = {
  step: Step;
  setStep: (step: Step) => void;
  network?: Network;
  receiver: string;
  transactions: (() => Promise<void>)[];
  executeTransactions: (transactions: (() => Promise<void>)[]) => Promise<void>;
  areTransactionsLoading: boolean;
  completedTransactions: number;
  transactionError: string;
  flowRateToReceiver: string;
  netImpact: bigint;
  newFlowRate: string;
  wrapAmount: string;
  amountPerTimeInterval: string;
  isFundingDistributionPool?: boolean;
  liquidationEstimate: number | null;
  token: Token;
  isSuperTokenPure: boolean;
  superTokenBalance: bigint;
  underlyingTokenBalance?: {
    value: bigint;
    formatted: string;
    decimals: number;
    symbol: string;
  };
  showQfMultiplier?: boolean;
};

type TransactionDetailsSnapshot = {
  wrapAmount?: string;
  underlyingTokenBalance?: string;
  superTokenBalance: bigint;
  liquidationEstimate: number | null;
  amountPerTimeInterval: string;
  netImpact: bigint;
  matchingMultiplier: number | null;
  newFlowRate: string;
  flowRateToReceiver: string;
};

dayjs().format();

export default function Review(props: ReviewProps) {
  const {
    step,
    setStep,
    network,
    receiver,
    transactions,
    completedTransactions,
    areTransactionsLoading,
    executeTransactions,
    transactionError,
    liquidationEstimate,
    flowRateToReceiver,
    newFlowRate,
    netImpact,
    wrapAmount,
    amountPerTimeInterval,
    token,
    isFundingDistributionPool,
    isSuperTokenPure,
    superTokenBalance,
    underlyingTokenBalance,
    showQfMultiplier,
  } = props;

  const [transactionDetailsSnapshot, setTransactionDetailsSnapshot] =
    useState<TransactionDetailsSnapshot | null>(null);
  const [
    hasAcceptedCloseLiquidationWarning,
    setHasAcceptedCloseLiquidationWarning,
  ] = useState(false);

  const { address, chain: connectedChain } = useAccount();
  const { switchChain } = useSwitchChain();

  const isDeletingStream =
    BigInt(flowRateToReceiver) > 0 && BigInt(newFlowRate) === BigInt(0);

  const isLiquidationClose = useMemo(
    () =>
      liquidationEstimate
        ? dayjs
            .unix(liquidationEstimate)
            .isBefore(dayjs().add(dayjs.duration({ days: 2 })))
        : false,
    [liquidationEstimate],
  );

  const handleSubmit = async () => {
    setTransactionDetailsSnapshot({
      wrapAmount: wrapAmount?.replace(/,/g, ""),
      underlyingTokenBalance: underlyingTokenBalance?.formatted,
      superTokenBalance,
      liquidationEstimate,
      amountPerTimeInterval: amountPerTimeInterval.replace(/,/g, ""),
      matchingMultiplier: showQfMultiplier
        ? parseFloat(
            (
              Number(formatEther(BigInt(netImpact))) /
              Number(
                formatEther(BigInt(newFlowRate) - BigInt(flowRateToReceiver)),
              )
            ).toFixed(2),
          )
        : null,
      netImpact,
      newFlowRate,
      flowRateToReceiver,
    });

    try {
      await executeTransactions(transactions);
    } catch (err) {
      console.error(err);

      setTransactionDetailsSnapshot(null);

      return;
    }

    setStep(Step.SUCCESS);
    setTransactionDetailsSnapshot(null);
  };

  return (
    <Card className="bg-lace-100 rounded-0 rounded-bottom-4 border-0">
      <Button
        variant="transparent"
        className="d-flex gap-3 p-4 border-0 rounded-0 shadow-none text-secondary fs-lg fw-semi-bold"
        style={{
          pointerEvents: "none",
        }}
        onClick={() => setStep(Step.REVIEW)}
      >
        <Badge
          pill
          className={`d-flex justify-content-center p-0 ${
            step !== Step.REVIEW && step !== Step.SUCCESS
              ? "bg-secondary"
              : step === Step.SUCCESS
                ? "bg-info"
                : "bg-primary"
          }`}
          style={{
            width: 28,
            height: 28,
          }}
        >
          {step === Step.SUCCESS ? (
            <Image
              src="/success.svg"
              alt="done"
              width={16}
              height={16}
              className="m-auto"
            />
          ) : (
            <Card.Text
              className="m-auto text-light"
              style={{ fontFamily: "Helvetica" }}
            >
              {isFundingDistributionPool && isSuperTokenPure
                ? 3
                : isFundingDistributionPool || isSuperTokenPure
                  ? 4
                  : 5}
            </Card.Text>
          )}
        </Badge>
        {Step.REVIEW}
      </Button>
      <Accordion.Collapse eventKey={Step.REVIEW} className="p-4 pt-0">
        <Stack direction="vertical" gap={2}>
          {Number(wrapAmount?.replace(/,/g, "")) > 0 && (
            <Stack direction="vertical" gap={1}>
              <Card.Text className="border-bottom border-secondary mb-2 pb-1">
                A. Wrap Tokens
              </Card.Text>
              <Stack
                direction="horizontal"
                gap={1}
                className="position-relative"
              >
                <Stack
                  direction="vertical"
                  gap={2}
                  className="justify-content-center align-items-center w-50 bg-white p-4 rounded-4"
                >
                  <Image src={token.icon} alt="done" width={28} height={28} />
                  <Card.Text className="m-0 border-0 text-center fs-lg fw-semi-bold">
                    {formatNumber(
                      Number(
                        areTransactionsLoading && transactionDetailsSnapshot
                          ? transactionDetailsSnapshot.wrapAmount?.replace(
                              /,/g,
                              "",
                            )
                          : wrapAmount.replace(/,/g, ""),
                      ),
                    )}{" "}
                    <br /> {underlyingTokenBalance?.symbol ?? "N/A"}
                  </Card.Text>
                  <Card.Text className="border-0 text-center">
                    New Balance:{" "}
                    {formatNumber(
                      Number(
                        areTransactionsLoading && transactionDetailsSnapshot
                          ? transactionDetailsSnapshot.underlyingTokenBalance
                          : underlyingTokenBalance?.formatted,
                      ) -
                        Number(
                          areTransactionsLoading && transactionDetailsSnapshot
                            ? transactionDetailsSnapshot.wrapAmount
                            : wrapAmount?.replace(/,/g, ""),
                        ),
                    )}
                  </Card.Text>
                </Stack>
                <Image
                  className="bg-transparent"
                  src="/arrow-right.svg"
                  alt="forward arrow"
                  width={18}
                  height={18}
                />
                <Stack
                  direction="vertical"
                  gap={2}
                  className="justify-content-center align-items-center w-50 bg-white p-4 rounded-4"
                >
                  <Image src={token.icon} alt="done" width={28} height={28} />
                  <Card.Text className="m-0 border-0 text-center fs-lg fw-semi-bold">
                    {formatNumber(
                      Number(
                        areTransactionsLoading && transactionDetailsSnapshot
                          ? transactionDetailsSnapshot.wrapAmount?.replace(
                              /,/g,
                              "",
                            )
                          : wrapAmount.replace(/,/g, ""),
                      ),
                    )}{" "}
                    <br /> {token.symbol}
                  </Card.Text>
                  <Card.Text className="border-0 text-center">
                    New Balance:{" "}
                    {areTransactionsLoading &&
                    transactionDetailsSnapshot?.wrapAmount
                      ? formatNumber(
                          Number(
                            formatEther(
                              transactionDetailsSnapshot.superTokenBalance +
                                parseEther(
                                  transactionDetailsSnapshot.wrapAmount,
                                ),
                            ),
                          ),
                        )
                      : formatNumber(
                          Number(
                            formatEther(
                              superTokenBalance +
                                parseEther(
                                  wrapAmount?.replace(/,/g, "") ?? "0",
                                ),
                            ),
                          ),
                        )}
                  </Card.Text>
                </Stack>
              </Stack>
              <Card.Text className="my-2 border-0 text-center text-secondary fw-semi-bold">
                1 {underlyingTokenBalance?.symbol ?? "N/A"} = 1 {token.symbol}
              </Card.Text>
            </Stack>
          )}
          <Stack direction="vertical" gap={1}>
            <Card.Text className="border-bottom border-secondary m-0 pb-1">
              {Number(
                areTransactionsLoading && transactionDetailsSnapshot
                  ? transactionDetailsSnapshot.wrapAmount
                  : wrapAmount?.replace(/,/g, ""),
              ) > 0
                ? "B."
                : "A."}{" "}
              {isFundingDistributionPool
                ? "Edit Matching Stream"
                : "Edit Grantee Stream"}
            </Card.Text>
          </Stack>
          <Stack direction="horizontal" className="justify-content-around px-2">
            <Card.Text className="m-0 border-0 text-center">Sender</Card.Text>
            <Card.Text className="m-0 border-0 text-center">Receiver</Card.Text>
          </Stack>
          <Stack direction="horizontal">
            <Badge className="d-flex justify-content-around align-items-center w-50 bg-white text-info px-3 py-4 rounded-4 border-0 text-center fw-semi-bold">
              <Card.Text className="m-0 sensitive">
                {truncateStr(address ?? "", 12)}
              </Card.Text>
              <CopyTooltip
                contentClick="Address copied"
                contentHover="Copy address"
                handleCopy={() => navigator.clipboard.writeText(address ?? "")}
                target={
                  <Image src="/copy.svg" alt="copy" width={18} height={18} />
                }
              />
            </Badge>
            <Image
              className="bg-transparent"
              src="/arrow-right.svg"
              alt="forward arrow"
              width={18}
              height={18}
            />
            <Badge className="d-flex justify-content-around align-items-center w-50 bg-white px-3 py-4 rounded-4 border-0 text-center text-info fw-semi-bold">
              {truncateStr(receiver, 12)}
              <CopyTooltip
                contentClick="Address copied"
                contentHover="Copy address"
                handleCopy={() => navigator.clipboard.writeText(receiver)}
                target={
                  <Image src="/copy.svg" alt="copy" width={18} height={18} />
                }
              />
            </Badge>
          </Stack>
          {isFundingDistributionPool && (
            <Stack
              direction="horizontal"
              gap={1}
              className="mt-1 px-2 align-items-center"
            >
              <Card.Text className="m-0 text-secondary small">
                Includes sustainability fee
              </Card.Text>
              <OverlayTrigger
                overlay={
                  <Tooltip id="t-sustainability-fee-info">
                    <p className="m-0 p-2">
                      7.5% of funding streamed to the Flow Council pool is
                      directed to support Flow State platform sustainability.
                    </p>
                  </Tooltip>
                }
              >
                <Image
                  src="/info.svg"
                  alt="sustainability fee info"
                  width={16}
                  height={16}
                />
              </OverlayTrigger>
            </Stack>
          )}
          <Stack direction="vertical">
            <Stack
              direction="horizontal"
              className={`mt-2 p-2 ${
                !isFundingDistributionPool ? "rounded-top-4" : "rounded-4"
              }`}
            >
              <Card.Text className="w-33 m-0">New Stream</Card.Text>
              <Stack
                direction="horizontal"
                gap={1}
                className="justify-content-end w-50 p-2"
              >
                <Image
                  src={token.icon}
                  alt="token"
                  width={22}
                  height={22}
                  className="mx-1"
                />
                <Badge className="bg-info w-75 ps-2 pe-2 py-2 fs-lg fw-semi-bold text-start overflow-hidden text-truncate">
                  {formatNumber(
                    Number(
                      areTransactionsLoading && transactionDetailsSnapshot
                        ? transactionDetailsSnapshot.amountPerTimeInterval
                        : amountPerTimeInterval.replace(/,/g, ""),
                    ),
                    4,
                  )}
                </Badge>
              </Stack>
              <Card.Text className="w-20 m-0 ms-1">/mo</Card.Text>
            </Stack>
            {!isFundingDistributionPool && (
              <>
                <Stack
                  direction="horizontal"
                  className="bg-light border-top border-secondary p-2"
                >
                  <Card.Text className="w-33 m-0">Est. Matching</Card.Text>
                  <Stack
                    direction="horizontal"
                    gap={1}
                    className="justify-content-end w-50 p-2"
                  >
                    <Image
                      src={token.icon}
                      alt="matching token"
                      width={22}
                      height={22}
                      className="mx-1"
                    />
                    <Badge className="bg-secondary w-75 ps-2 pe-2 py-2 fs-lg fw-semi-bold text-start">
                      {areTransactionsLoading &&
                      transactionDetailsSnapshot?.netImpact
                        ? `${
                            transactionDetailsSnapshot.netImpact > 0 ? "+" : ""
                          }${parseFloat(
                            (
                              Number(
                                formatEther(
                                  transactionDetailsSnapshot.netImpact,
                                ),
                              ) * fromTimeUnitsToSeconds(1, "months")
                            ).toFixed(6),
                          )}`
                        : netImpact
                          ? `${netImpact > 0 ? "+" : ""}${parseFloat(
                              (
                                Number(formatEther(netImpact)) *
                                fromTimeUnitsToSeconds(1, "months")
                              ).toFixed(6),
                            )}`
                          : 0}
                    </Badge>
                  </Stack>
                  <Card.Text className="w-20 m-0 ms-1">/mo</Card.Text>
                </Stack>
                {showQfMultiplier && (
                  <Stack
                    direction="horizontal"
                    className="bg-light border-top border-secondary p-2"
                  >
                    <Card.Text className="w-33 m-0">QF Multiplier</Card.Text>
                    <Stack
                      direction="horizontal"
                      gap={1}
                      className="justify-content-end w-50 p-2"
                    >
                      <Badge
                        className={`${
                          BigInt(
                            areTransactionsLoading && transactionDetailsSnapshot
                              ? transactionDetailsSnapshot.newFlowRate
                              : newFlowRate,
                          ) <
                          BigInt(
                            areTransactionsLoading && transactionDetailsSnapshot
                              ? transactionDetailsSnapshot.flowRateToReceiver
                              : flowRateToReceiver,
                          )
                            ? "bg-danger"
                            : "bg-primary"
                        } w-75 ps-2 pe-2 py-2 fs-lg fw-semi-bold text-start`}
                      >
                        {parseFloat(
                          (
                            Number(
                              formatEther(
                                BigInt(
                                  areTransactionsLoading &&
                                    transactionDetailsSnapshot
                                    ? transactionDetailsSnapshot.netImpact
                                    : netImpact,
                                ),
                              ),
                            ) /
                            Number(
                              formatEther(
                                BigInt(
                                  areTransactionsLoading &&
                                    transactionDetailsSnapshot
                                    ? transactionDetailsSnapshot.newFlowRate
                                    : newFlowRate,
                                ) -
                                  BigInt(
                                    areTransactionsLoading &&
                                      transactionDetailsSnapshot
                                      ? transactionDetailsSnapshot.flowRateToReceiver
                                      : flowRateToReceiver,
                                  ),
                              ),
                            )
                          ).toFixed(2),
                        )}
                        x
                      </Badge>
                    </Stack>
                    <span className="w-20 ms-1" />
                  </Stack>
                )}
              </>
            )}
          </Stack>
          {!!liquidationEstimate && !isNaN(liquidationEstimate) && (
            <Stack direction="horizontal" gap={1} className="mt-1 p-2">
              <Card.Text className="m-0">Est. Liquidation</Card.Text>
              <OverlayTrigger
                overlay={
                  <Tooltip id="t-liquidation-info">
                    <p className="m-0 p-2">
                      This is the current estimate for when your token balance
                      will reach 0. Make sure to close your stream or{" "}
                      {isSuperTokenPure ? "deposit" : "wrap"} more tokens before
                      this date to avoid loss of your buffer deposit.
                    </p>
                  </Tooltip>
                }
              >
                <Image
                  src="/info.svg"
                  alt="liquidation info"
                  width={18}
                  height={18}
                />
              </OverlayTrigger>
              <Card.Text className="m-0 ms-1 fs-lg fw-semi-bold">
                {dayjs
                  .unix(
                    areTransactionsLoading &&
                      transactionDetailsSnapshot?.liquidationEstimate
                      ? transactionDetailsSnapshot.liquidationEstimate
                      : liquidationEstimate,
                  )
                  .format("MMMM D, YYYY")}
              </Card.Text>
            </Stack>
          )}
          {isLiquidationClose && (
            <Stack direction="vertical">
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
          <Button
            variant={isDeletingStream ? "danger" : "primary"}
            disabled={
              transactions.length === 0 ||
              step === Step.SUCCESS ||
              (isLiquidationClose && !hasAcceptedCloseLiquidationWarning)
            }
            className="d-flex justify-content-center mt-4 py-4 rounded-4 fw-semi-bold text-light"
            onClick={
              network && connectedChain?.id !== network.id
                ? () => switchChain({ chainId: network.id })
                : handleSubmit
            }
          >
            {areTransactionsLoading ? (
              <Stack
                direction="horizontal"
                gap={2}
                className="justify-content-center"
              >
                <Spinner
                  size="sm"
                  animation="border"
                  role="status"
                  className="p-2"
                />
                <Card.Text className="m-0 fw-semi-bold">
                  {completedTransactions + 1}/{transactions.length}
                </Card.Text>
              </Stack>
            ) : isDeletingStream ? (
              "Cancel Stream"
            ) : transactions.length > 0 ? (
              `Submit (${transactions.length})`
            ) : (
              "Submit"
            )}
          </Button>
          {transactionError && (
            <Alert
              variant="danger"
              className="mt-2 rounded-4 py-4 text-light fw-semi-bold text-wrap text-break"
              style={{ pointerEvents: "none" }}
            >
              {transactionError}
            </Alert>
          )}
        </Stack>
      </Accordion.Collapse>
    </Card>
  );
}
